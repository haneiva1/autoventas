import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { config } from '../lib/config.js';
import { storeOutboundMessage } from '../services/message-store.js';

const PaymentIdSchema = z.object({
  id: z.string().uuid(),
});

export const paymentsRoutes: FastifyPluginAsync = async (fastify) => {
  // List pending payment reviews
  fastify.get('/pending', async (request, reply) => {
    const { data, error } = await supabaseAdmin
      .from('payments')
      .select(`
        *,
        orders!inner (
          id,
          customer_name,
          customer_phone,
          products_json,
          total_amount,
          currency,
          status
        )
      `)
      .is('vendor_decision', null)
      .in('status', ['pending', 'pending_review'])
      .order('reported_at', { ascending: false });

    if (error) {
      request.log.error({ error }, 'Failed to fetch pending payments');
      return reply.status(500).send({ error: 'Database error' });
    }

    return reply.send({ payments: data });
  });

  // Get payment detail
  fastify.get('/:id', async (request, reply) => {
    const params = PaymentIdSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'Invalid payment ID' });
    }

    const { data, error } = await supabaseAdmin
      .from('payments')
      .select(`
        *,
        orders!inner (
          id,
          customer_name,
          customer_phone,
          products_json,
          total_amount,
          currency,
          status,
          delivery_method,
          delivery_address
        ),
        conversations (
          id,
          contact_id
        )
      `)
      .eq('id', params.data.id)
      .single();

    if (error || !data) {
      return reply.status(404).send({ error: 'Payment not found' });
    }

    return reply.send({ payment: data });
  });

  // Approve payment (Mark Paid)
  fastify.post('/:id/approve', async (request, reply) => {
    const params = PaymentIdSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'Invalid payment ID' });
    }

    // Get payment with order_id
    const { data: payment, error: fetchError } = await supabaseAdmin
      .from('payments')
      .select('*, conversations (id)')
      .eq('id', params.data.id)
      .single();

    if (fetchError || !payment) {
      request.log.error({ error: fetchError, paymentId: params.data.id }, 'Payment not found');
      return reply.status(404).send({ error: 'Payment not found' });
    }

    if (payment.vendor_decision !== null) {
      return reply.status(400).send({ error: 'Payment already reviewed' });
    }

    // Validate order_id exists
    const orderId = payment.order_id;
    if (!orderId) {
      request.log.error({ paymentId: params.data.id }, 'Payment has no order_id');
      return reply.status(500).send({ error: 'Payment has no linked order' });
    }

    request.log.info({ paymentId: params.data.id, orderId }, 'Approving payment');

    // Update payment
    const { data: updatedPayment, error: paymentError } = await supabaseAdmin
      .from('payments')
      .update({
        vendor_decision: 'approved',
        vendor_decided_at: new Date().toISOString(),
        status: 'approved',
      })
      .eq('id', params.data.id)
      .select()
      .single();

    if (paymentError || !updatedPayment) {
      request.log.error({ error: paymentError }, 'Failed to update payment');
      return reply.status(500).send({ error: 'Database error updating payment' });
    }

    // Update order status to CONFIRMED
    const { data: orderRows, error: orderError } = await supabaseAdmin
      .from('orders')
      .update({
        status: 'CONFIRMED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .select();

    request.log.info({ orderId, orderRows, orderError }, 'Order update result');

    if (orderError) {
      request.log.error({ error: orderError, orderId }, 'Order update query failed');
      return reply.status(500).send({ error: `Order update failed for order_id=${orderId}` });
    }

    if (!orderRows || orderRows.length === 0) {
      request.log.error({ orderId }, 'No order row was updated');
      return reply.status(500).send({ error: `Order update failed: no order found with id=${orderId}` });
    }

    const updatedOrder = orderRows[0];

    // Generate thank you message
    if (payment.conversations?.id) {
      const thankYouMessage = `¡Gracias ${updatedOrder.customer_name || 'cliente'}! Tu pago ha sido confirmado. Tu pedido está siendo procesado.`;

      await storeOutboundMessage({
        conversationId: payment.conversations.id,
        body: thankYouMessage,
        orderId: orderId,
        log: request.log,
      });
    }

    // Create notification
    await supabaseAdmin.from('vendi_merchant_notifications').insert({
      tenant_id: config.TENANT_ID,
      notification_type: 'payment_approved',
      title: 'Pago aprobado',
      body: `Pago de ${updatedOrder.customer_name || 'cliente'} aprobado`,
      reference_type: 'payment',
      reference_id: params.data.id,
    });

    request.log.info({ paymentId: params.data.id, orderId, orderStatus: updatedOrder.status }, 'Payment approved');

    return reply.send({ payment: updatedPayment, order: updatedOrder });
  });

  // Reject payment (Not Paid)
  fastify.post('/:id/reject', async (request, reply) => {
    const params = PaymentIdSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'Invalid payment ID' });
    }

    // Get payment with order_id
    const { data: payment, error: fetchError } = await supabaseAdmin
      .from('payments')
      .select('*, conversations (id)')
      .eq('id', params.data.id)
      .single();

    if (fetchError || !payment) {
      request.log.error({ error: fetchError, paymentId: params.data.id }, 'Payment not found');
      return reply.status(404).send({ error: 'Payment not found' });
    }

    if (payment.vendor_decision !== null) {
      return reply.status(400).send({ error: 'Payment already reviewed' });
    }

    // Validate order_id exists
    const orderId = payment.order_id;
    if (!orderId) {
      request.log.error({ paymentId: params.data.id }, 'Payment has no order_id');
      return reply.status(500).send({ error: 'Payment has no linked order' });
    }

    request.log.info({ paymentId: params.data.id, orderId }, 'Rejecting payment');

    // Update payment
    const { data: updatedPayment, error: paymentError } = await supabaseAdmin
      .from('payments')
      .update({
        vendor_decision: 'rejected',
        vendor_decided_at: new Date().toISOString(),
        status: 'rejected',
      })
      .eq('id', params.data.id)
      .select()
      .single();

    if (paymentError || !updatedPayment) {
      request.log.error({ error: paymentError }, 'Failed to update payment');
      return reply.status(500).send({ error: 'Database error updating payment' });
    }

    // Update order status to PAYMENT_REJECTED
    const { data: orderRows, error: orderError } = await supabaseAdmin
      .from('orders')
      .update({
        status: 'PAYMENT_REJECTED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .select();

    request.log.info({ orderId, orderRows, orderError }, 'Order update result');

    if (orderError) {
      request.log.error({ error: orderError, orderId }, 'Order update query failed');
      return reply.status(500).send({ error: `Order update failed for order_id=${orderId}` });
    }

    if (!orderRows || orderRows.length === 0) {
      request.log.error({ orderId }, 'No order row was updated');
      return reply.status(500).send({ error: `Order update failed: no order found with id=${orderId}` });
    }

    const updatedOrder = orderRows[0];

    // Generate clarification message
    if (payment.conversations?.id) {
      const clarificationMessage = `Hola ${updatedOrder.customer_name || 'cliente'}, no pudimos verificar tu pago. ¿Podrías enviarnos nuevamente el comprobante o confirmar los detalles de la transferencia?`;

      await storeOutboundMessage({
        conversationId: payment.conversations.id,
        body: clarificationMessage,
        orderId: orderId,
        log: request.log,
      });
    }

    // Create notification
    await supabaseAdmin.from('vendi_merchant_notifications').insert({
      tenant_id: config.TENANT_ID,
      notification_type: 'payment_rejected',
      title: 'Pago rechazado',
      body: `Pago de ${updatedOrder.customer_name || 'cliente'} rechazado - solicitar aclaración`,
      reference_type: 'payment',
      reference_id: params.data.id,
    });

    request.log.info({ paymentId: params.data.id, orderId, orderStatus: updatedOrder.status }, 'Payment rejected');

    return reply.send({ payment: updatedPayment, order: updatedOrder });
  });
};
