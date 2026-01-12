import { supabaseAdmin } from '../lib/supabase.js';
import { config } from '../lib/config.js';
import { WhatsAppWebhook, WhatsAppMessage, WhatsAppContact } from '../schemas/whatsapp.js';
import { generateAIReply } from './ai-agent.js';
import { detectPaymentProof, createPaymentReview } from './payment-detector.js';
import { storeOutboundMessage } from './message-store.js';
import type { AppLogger } from '../lib/types.js';

export async function processWebhookEvent(
  payload: WhatsAppWebhook,
  log: AppLogger
): Promise<void> {
  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      const value = change.value;

      // Skip if no messages (could be status update)
      if (!value.messages || value.messages.length === 0) {
        log.debug('No messages in webhook event, skipping');
        continue;
      }

      for (const message of value.messages) {
        const contact = value.contacts?.[0];
        const dedupeKey = `wa:${message.id}`;

        // Check for duplicate
        const { data: existingEvent } = await supabaseAdmin
          .from('webhook_events')
          .select('id')
          .eq('dedupe_key', dedupeKey)
          .single();

        if (existingEvent) {
          log.debug({ messageId: message.id }, 'Duplicate webhook event, skipping');
          continue;
        }

        // Store raw webhook event
        const { error: eventError } = await supabaseAdmin
          .from('webhook_events')
          .insert({
            tenant_id: config.TENANT_ID,
            source: 'whatsapp',
            event_type: 'message',
            dedupe_key: dedupeKey,
            payload: payload,
            received_at: new Date().toISOString(),
          });

        if (eventError) {
          log.error({ error: eventError }, 'Failed to store webhook event');
          continue;
        }

        // Process the message
        await processMessage(message, contact, log);
      }
    }
  }
}

export async function processMessage(
  message: WhatsAppMessage,
  contact: WhatsAppContact | undefined,
  log: AppLogger
): Promise<{ conversationId: string | null; orderId: string | null; paymentId: string | null }> {
  const waPhone = message.from;
  const contactName = contact?.profile?.name || null;

  // Find or create contact
  const { data: dbContact, error: contactError } = await supabaseAdmin
    .from('contacts')
    .upsert(
      {
        tenant_id: config.TENANT_ID,
        wa_phone: waPhone,
        name: contactName,
        tags: [],
        metadata: {},
      },
      {
        onConflict: 'tenant_id,wa_phone',
        ignoreDuplicates: false,
      }
    )
    .select()
    .single();

  if (contactError || !dbContact) {
    log.error({ error: contactError }, 'Failed to upsert contact');
    return { conversationId: null, orderId: null, paymentId: null };
  }

  // Find or create conversation
  let conversation = await findActiveConversation(dbContact.id, log);
  if (!conversation) {
    conversation = await createConversation(dbContact.id, log);
  }

  if (!conversation) {
    log.error('Failed to get or create conversation');
    return { conversationId: null, orderId: null, paymentId: null };
  }

  // Extract message body
  const messageBody = extractMessageBody(message);

  // Store normalized message
  log.info({ tenant_id: config.TENANT_ID, conversation_id: conversation.id, direction: 'in', message_type: message.type, body: messageBody }, '[DEBUG] About to insert INBOUND message into messages table');
  const { data: storedMessage, error: messageError } = await supabaseAdmin
    .from('messages')
    .insert({
      tenant_id: config.TENANT_ID,
      conversation_id: conversation.id,
      direction: 'in',
      message_type: message.type,
      body: messageBody,
      wa_message_id: message.id,
      raw: message,
    })
    .select()
    .single();

  log.info({ storedMessage, messageError }, '[DEBUG] INBOUND message insert result');
  if (messageError) {
    log.error({ error: messageError }, 'Failed to store message');
    return { conversationId: conversation.id, orderId: null, paymentId: null };
  }

  log.info(
    { messageId: storedMessage.id, type: message.type },
    'Message stored successfully'
  );

  // Update conversation last_message_at
  await supabaseAdmin
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversation.id);

  // Check for payment proof
  const isPaymentProof = detectPaymentProof(message, messageBody);

  if (isPaymentProof) {
    log.info('Payment proof detected');
    const paymentResult = await createPaymentReview({
      conversationId: conversation.id,
      contactId: dbContact.id,
      customerPhone: waPhone,
      customerName: contactName,
      messageText: messageBody,
      mediaId: message.image?.id || null,
      log,
    });
    return {
      conversationId: conversation.id,
      orderId: paymentResult?.orderId || null,
      paymentId: paymentResult?.paymentId || null,
    }; // Don't generate AI reply for payment proofs
  }

  // Generate AI reply
  try {
    const conversationHistory = await getConversationHistory(conversation.id);
    const products = await getProductCatalog();

    const aiReply = await generateAIReply({
      customerName: contactName,
      messageBody,
      conversationHistory,
      products,
      log,
    });

    if (aiReply) {
      await storeOutboundMessage({
        conversationId: conversation.id,
        body: aiReply,
        log,
      });
      log.info('AI reply stored');
    }
  } catch (error) {
    log.error({ error }, 'Failed to generate AI reply');
    // Store fallback message
    await storeOutboundMessage({
      conversationId: conversation.id,
      body: 'Estoy teniendo problemas, un humano te escribirá.',
      log,
    });
  }

  return { conversationId: conversation.id, orderId: null, paymentId: null };
}

function extractMessageBody(message: WhatsAppMessage): string | null {
  switch (message.type) {
    case 'text':
      return message.text?.body || null;
    case 'image':
      return message.image?.caption || '[Imagen recibida]';
    default:
      return `[${message.type}]`;
  }
}

async function findActiveConversation(
  contactId: string,
  log: AppLogger
): Promise<{ id: string } | null> {
  // Find conversation from last 24 hours
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('contact_id', contactId)
    .eq('tenant_id', config.TENANT_ID)
    .gte('last_message_at', cutoff)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = no rows found
    log.error({ error }, 'Error finding conversation');
  }

  return data;
}

async function createConversation(
  contactId: string,
  log: AppLogger
): Promise<{ id: string } | null> {
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .insert({
      tenant_id: config.TENANT_ID,
      contact_id: contactId,
      status: 'active',
      channel: 'whatsapp',
      last_message_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    log.error({ error }, 'Failed to create conversation');
    return null;
  }

  return data;
}

async function getConversationHistory(
  conversationId: string
): Promise<Array<{ direction: string; body: string | null }>> {
  const { data } = await supabaseAdmin
    .from('messages')
    .select('direction, body')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(20);

  return data || [];
}

async function getProductCatalog(): Promise<
  Array<{ name: string; price: number; description: string | null }>
> {
  const { data } = await supabaseAdmin
    .from('vendi_products')
    .select('name, price, description')
    .eq('tenant_id', config.TENANT_ID)
    .eq('is_active', true);

  return data || [];
}
