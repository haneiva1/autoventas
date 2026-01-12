import { supabaseAdmin } from '../lib/supabase.js';
import { config } from '../lib/config.js';
import type { AppLogger } from '../lib/types.js';
import { enqueueOutboundMessage } from './outbound-queue.js';

interface StoreOutboundMessageParams {
  conversationId: string;
  body: string;
  orderId?: string;
  log: AppLogger;
}

/**
 * Store an outbound message in the messages table AND enqueue for sending.
 * Returns the message ID if successful.
 */
export async function storeOutboundMessage(
  params: StoreOutboundMessageParams
): Promise<string | null> {
  const { conversationId, body, orderId, log } = params;

  // First, get the contact phone for the conversation
  log.info({ conversationId }, '[DEBUG] About to query conversation for contact phone');
  const { data: conversation, error: convError } = await supabaseAdmin
    .from('conversations')
    .select('contact_id, contacts!inner(wa_phone)')
    .eq('id', conversationId)
    .single();

  if (convError) {
    log.error({ error: convError, conversationId }, '[DEBUG] Failed to get conversation with contacts');
  }
  log.info({ conversation, conversationId }, '[DEBUG] Conversation query result');

  // contacts is a single object due to the foreign key relationship
  const contactData = conversation?.contacts as { wa_phone: string } | undefined;
  const toPhone = contactData?.wa_phone;

  // Store in messages table
  log.info({ tenant_id: config.TENANT_ID, conversation_id: conversationId, direction: 'out', body }, '[DEBUG] About to insert OUTBOUND message into messages table');
  const { data, error } = await supabaseAdmin
    .from('messages')
    .insert({
      tenant_id: config.TENANT_ID,
      conversation_id: conversationId,
      direction: 'out',
      message_type: 'text',
      body,
      order_id: orderId || null,
      raw: { type: 'draft', body }, // Draft message, not yet sent
    })
    .select('id')
    .single();

  log.info({ data, error }, '[DEBUG] OUTBOUND message insert result');

  if (error) {
    log.error({ error }, 'Failed to store outbound message');
    return null;
  }

  // Update conversation last_message_at
  await supabaseAdmin
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId);

  // Enqueue for actual sending (if we have a phone number)
  if (toPhone) {
    await enqueueOutboundMessage(
      {
        to_phone: toPhone,
        body,
        message_type: 'text',
        conversation_id: conversationId,
        order_id: orderId,
      },
      log
    );
  } else {
    log.warn({ conversationId }, 'No phone number found for conversation, message not queued for sending');
  }

  return data.id;
}
