import { supabaseAdmin } from '../lib/supabase.js';
import { config } from '../lib/config.js';
import { WhatsAppMessage } from '../schemas/whatsapp.js';
import type { AppLogger } from '../lib/types.js';

// Keywords that indicate payment proof
const PAYMENT_KEYWORDS = [
  'pagué',
  'pague',
  'pagado',
  'transferí',
  'transferi',
  'transferencia',
  'comprobante',
  'deposité',
  'deposite',
  'depósito',
  'deposito',
  'envié el pago',
  'envie el pago',
  'ya pagué',
  'ya pague',
  'listo el pago',
  'hice el pago',
  'realicé el pago',
  'realice el pago',
];

export function detectPaymentProof(
  message: WhatsAppMessage,
  messageBody: string | null
): boolean {
  // Image with or without caption is likely payment proof
  if (message.type === 'image') {
    return true;
  }

  // Check text for payment keywords
  if (message.type === 'text' && messageBody) {
    const lowerBody = messageBody.toLowerCase();
    return PAYMENT_KEYWORDS.some((keyword) => lowerBody.includes(keyword));
  }

  return false;
}

interface CreatePaymentReviewParams {
  conversationId: string;
  contactId: string;
  customerPhone: string;
  customerName: string | null;
  messageText: string | null;
  mediaId: string | null;
  log: AppLogger;
}

export async function createPaymentReview(
  params: CreatePaymentReviewParams
): Promise<{ orderId: string; paymentId: string } | null> {
  const {
    conversationId,
    contactId,
    customerPhone,
    customerName,
    messageText,
    mediaId,
    log,
  } = params;

  // Find the most recent pending order for this customer
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('id, total_amount, products_json, status')
    .eq('customer_phone', customerPhone)
    .in('status', ['DRAFT', 'PENDING_PAYMENT'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (orderError && orderError.code !== 'PGRST116') {
    log.error({ error: orderError }, 'Error finding order for payment');
  }

  // If no order exists, create a placeholder order
  let orderId: string;
  if (!order) {
    log.info('No pending order found, creating placeholder order');
    const { data: newOrder, error: createError } = await supabaseAdmin
      .from('orders')
      .insert({
        customer_phone: customerPhone,
        customer_name: customerName,
        status: 'PENDING_PAYMENT',
        currency: 'BOB',
        products_json: [],
        total_amount: 0, // Will need manual review
      })
      .select('id')
      .single();

    if (createError || !newOrder) {
      log.error({ error: createError }, 'Failed to create placeholder order');
      return null;
    }
    orderId = newOrder.id;
  } else {
    orderId = order.id;

    // Update order status to PENDING_PAYMENT if it was DRAFT
    if (order.status === 'DRAFT') {
      await supabaseAdmin
        .from('orders')
        .update({ status: 'PENDING_PAYMENT', updated_at: new Date().toISOString() })
        .eq('id', orderId);
    }
  }

  // Create payment record
  const { data: payment, error: paymentError } = await supabaseAdmin
    .from('payments')
    .insert({
      order_id: orderId,
      tenant_id: config.TENANT_ID,
      conversation_id: conversationId,
      reported_by_phone: customerPhone,
      proof_media_id: mediaId,
      proof_message_text: messageText,
      reported_at: new Date().toISOString(),
      status: 'pending',
    })
    .select('id')
    .single();

  if (paymentError || !payment) {
    log.error({ error: paymentError }, 'Failed to create payment record');
    return null;
  }

  // Create merchant notification
  const { error: notifError } = await supabaseAdmin
    .from('vendi_merchant_notifications')
    .insert({
      tenant_id: config.TENANT_ID,
      notification_type: 'payment_proof',
      title: 'Nuevo comprobante de pago',
      body: `${customerName || customerPhone} envió un comprobante de pago`,
      reference_type: 'payment',
      reference_id: payment.id,
    });

  if (notifError) {
    log.error({ error: notifError }, 'Failed to create notification');
  }

  log.info(
    { paymentId: payment.id, orderId },
    'Payment review created successfully'
  );

  return { orderId, paymentId: payment.id };
}
