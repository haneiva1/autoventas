import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { config } from '../lib/config.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { generateReply } from '../services/llm.js';
import { processWithRules, getContext } from '../helpers/index.js';

// ============================================================================
// WhatsApp Webhook Schema
// ============================================================================

const TextMessageSchema = z.object({
  body: z.string(),
});

const MessageSchema = z.object({
  from: z.string(),
  id: z.string(),
  timestamp: z.string(),
  type: z.string(),
  text: TextMessageSchema.optional(),
});

const ContactSchema = z.object({
  profile: z.object({
    name: z.string(),
  }),
  wa_id: z.string(),
});

const MetadataSchema = z.object({
  display_phone_number: z.string(),
  phone_number_id: z.string(),
});

const ValueSchema = z.object({
  messaging_product: z.literal('whatsapp'),
  metadata: MetadataSchema,
  contacts: z.array(ContactSchema).optional(),
  messages: z.array(MessageSchema).optional(),
  statuses: z.array(z.any()).optional(),
});

const ChangeSchema = z.object({
  value: ValueSchema,
  field: z.literal('messages'),
});

const EntrySchema = z.object({
  id: z.string(),
  changes: z.array(ChangeSchema),
});

const WhatsAppWebhookSchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(EntrySchema),
});

// ============================================================================
// Database Persistence
// ============================================================================

interface PersistMessageParams {
  direction: 'inbound' | 'outbound';
  phone: string;
  name?: string | null;
  text: string;
  raw?: unknown;
  waMessageId?: string;
  requestId: string;
}

async function persistMessage(params: PersistMessageParams, log: any): Promise<string | null> {
  const { direction, phone, name, text, raw, waMessageId, requestId } = params;

  try {
    const { data, error } = await supabaseAdmin
      .from('messages')
      .insert({
        direction,
        wa_phone: phone,
        sender_name: name || null,
        body: text,
        raw_payload: raw ? JSON.stringify(raw) : null,
        wa_message_id: waMessageId || null,
        tenant_id: config.TENANT_ID,
      })
      .select('id')
      .single();

    if (error) {
      log.error({ error: error.message, code: error.code, requestId }, '[DB] Failed to persist message');
      return null;
    }

    log.info({ messageDbId: data.id, direction, phone: phone.slice(-4), requestId }, '[DB] Message persisted');
    return data.id;
  } catch (err) {
    log.error({ error: err, requestId }, '[DB] Exception persisting message');
    return null;
  }
}

// ============================================================================
// WhatsApp Cloud API - Send Message
// ============================================================================

async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  const phoneNumberId = config.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = config.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    console.log('[WA] Skipping send (no credentials):', { to: to.slice(-4), text: text.slice(0, 50) });
    return;
  }

  const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: text },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[WA] Send failed:', response.status, errorText);
  }
}

// ============================================================================
// Message Processing with Rules + LLM Fallback
// ============================================================================

async function processMessage(
  phone: string,
  messageText: string,
  contactName: string | null,
  log: any,
  requestId: string
): Promise<void> {
  // Log context state before processing
  const contextBefore = getContext(phone);
  log.info(
    {
      phone: phone.slice(-4),
      textPreview: messageText.slice(0, 50),
      state: contextBefore.state,
      flavor: contextBefore.flavor,
      requestId,
    },
    '[PROCESS] Processing message'
  );

  // ========================================
  // PASO 1: Intentar manejar con reglas
  // ========================================
  const ruleResult = processWithRules(phone, messageText, contactName);

  if (ruleResult.handled && ruleResult.reply) {
    log.info(
      {
        phone: phone.slice(-4),
        newState: ruleResult.newState,
        requestId,
      },
      '[RULES] Message handled by rules'
    );

    // Enviar respuesta y terminar
    await sendWhatsAppMessage(phone, ruleResult.reply);
    return; // <-- IMPORTANTE: corta flujo, no llama al LLM
  }

  // ========================================
  // PASO 2: Fallback al LLM
  // ========================================
  log.info(
    { phone: phone.slice(-4), requestId },
    '[PROCESS] Rules did not handle, using LLM'
  );

  const reply = await generateReply(messageText);

  await sendWhatsAppMessage(phone, reply);
}

// ============================================================================
// Fastify Routes
// ============================================================================

export const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /webhooks/whatsapp - Meta verification
  fastify.get('/whatsapp', async (request, reply) => {
    const query = request.query as Record<string, string>;

    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    const verifyToken = config.WHATSAPP_VERIFY_TOKEN;

    if (mode === 'subscribe' && token === verifyToken) {
      return reply.status(200).type('text/plain').send(challenge);
    }

    return reply.status(403).type('text/plain').send('Forbidden');
  });

  // POST /webhooks/whatsapp - Incoming events
  fastify.post('/whatsapp', async (request, reply) => {
    const startTime = Date.now();
    const requestId = randomUUID();

    const parseResult = WhatsAppWebhookSchema.safeParse(request.body);
    if (!parseResult.success) {
      request.log.warn({ errors: parseResult.error.issues, requestId }, '[WEBHOOK] Invalid payload');
      return reply.status(400).send({ error: 'Invalid payload' });
    }

    const payload = parseResult.data;

    // Process messages
    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        const value = change.value;

        // Skip if no messages (could be status update)
        if (!value.messages || value.messages.length === 0) {
          request.log.debug({ requestId }, '[WEBHOOK] No messages in event, skipping');
          continue;
        }

        for (const message of value.messages) {
          // Only process text messages
          if (message.type !== 'text' || !message.text?.body) {
            request.log.debug({ type: message.type, requestId }, '[WEBHOOK] Skipping non-text message');
            continue;
          }

          const phone = message.from;
          const text = message.text.body;
          const waMessageId = message.id;
          const contactName = value.contacts?.[0]?.profile?.name || null;

          request.log.info(
            { requestId, wa_id: phone.slice(-4), textPreview: text.slice(0, 50), waMessageId },
            '[WEBHOOK] Inbound message received'
          );

          // Persist inbound message
          persistMessage({
            direction: 'inbound',
            phone,
            name: contactName,
            text,
            raw: request.body,
            waMessageId,
            requestId,
          }, request.log).catch(err =>
            request.log.error({ error: err, requestId }, '[DB] Failed to persist inbound')
          );

          // Process asynchronously to not block webhook response
          setImmediate(async () => {
            try {
              await processMessage(phone, text, contactName, request.log, requestId);
            } catch (error) {
              request.log.error({ error, phone: phone.slice(-4), requestId }, '[PROCESS] Failed to process message');
            }
          });
        }
      }
    }

    const duration = Date.now() - startTime;
    request.log.info({ duration, requestId }, '[WEBHOOK] Response sent');

    return reply.status(200).send({ received: true });
  });
};
