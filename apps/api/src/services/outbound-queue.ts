import { supabaseAdmin } from '../lib/supabase.js';
import type { AppLogger } from '../lib/types.js';

export interface EnqueueOutboundMessageParams {
  to_phone: string;
  body: string;
  message_type?: 'text' | 'image' | 'template';
  conversation_id?: string;
  order_id?: string;
  seller_id?: string;
  metadata?: Record<string, unknown>;
}

export interface OutboundMessage {
  id: string;
  created_at: string;
  to_phone: string;
  body: string;
  status: string;
}

/**
 * Enqueue an outbound message for sending via WhatsApp (or other channels).
 * Currently queues the message; actual sending will be implemented later.
 */
export async function enqueueOutboundMessage(
  params: EnqueueOutboundMessageParams,
  log: AppLogger
): Promise<{ outbound_id: string } | null> {
  const {
    to_phone,
    body,
    message_type = 'text',
    conversation_id,
    order_id,
    seller_id,
    metadata = {},
  } = params;

  log.info({ to_phone, body, message_type, conversation_id }, '[DEBUG] About to insert into outbound_messages table');
  const { data, error } = await supabaseAdmin
    .from('outbound_messages')
    .insert({
      to_phone,
      body,
      message_type,
      conversation_id: conversation_id || null,
      order_id: order_id || null,
      seller_id: seller_id || null,
      metadata,
      channel: 'whatsapp',
      status: 'pending',
    })
    .select('id')
    .single();

  log.info({ data, error }, '[DEBUG] outbound_messages insert result');

  if (error || !data) {
    log.error({ error, to_phone }, 'Failed to enqueue outbound message');
    return null;
  }

  log.info({ outbound_id: data.id, to_phone }, 'Outbound message enqueued');
  return { outbound_id: data.id };
}

export interface SendMessageParams {
  to_phone: string;
  body: string;
  conversation_id?: string;
  order_id?: string;
}

export interface SendMessageResult {
  queued: boolean;
  outbound_id: string | null;
  message_id: string | null;
}

/**
 * Send a message to a phone number.
 * Currently queues the message; actual WhatsApp sending will be implemented later.
 */
export async function sendMessage(
  params: SendMessageParams,
  log: AppLogger
): Promise<SendMessageResult> {
  const { to_phone, body, conversation_id, order_id } = params;

  // Enqueue for actual sending
  const queueResult = await enqueueOutboundMessage(
    {
      to_phone,
      body,
      message_type: 'text',
      conversation_id,
      order_id,
    },
    log
  );

  return {
    queued: queueResult !== null,
    outbound_id: queueResult?.outbound_id || null,
    message_id: null, // Will be set when actually sent
  };
}
