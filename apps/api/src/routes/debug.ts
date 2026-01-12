import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { config } from '../lib/config.js';
import { processMessage } from '../services/webhook-processor.js';
import { enqueueOutboundMessage } from '../services/outbound-queue.js';
import type { WhatsAppMessage, WhatsAppContact } from '../schemas/whatsapp.js';

const ALLOW_DEBUG_SEEDS = process.env.ALLOW_DEBUG_SEEDS === 'true';
const DEBUG_SEED_TOKEN = process.env.DEBUG_SEED_TOKEN;

export const debugRoutes: FastifyPluginAsync = async (fastify) => {
  // Seed a payment review for testing
  fastify.post('/seed-payment-review', async (request, reply) => {
    // Security: disabled unless explicitly enabled
    if (!ALLOW_DEBUG_SEEDS) {
      return reply.status(404).send({ error: 'Not found' });
    }

    // Security: require debug token header
    const token = request.headers['x-debug-token'];
    if (!DEBUG_SEED_TOKEN || token !== DEBUG_SEED_TOKEN) {
      return reply.status(404).send({ error: 'Not found' });
    }

    const now = new Date().toISOString();
    const testPhone = `591700${Date.now().toString().slice(-6)}`;
    const testName = `Test Customer ${Date.now().toString().slice(-4)}`;

    try {
      // Create order
      const { data: order, error: orderError } = await supabaseAdmin
        .from('orders')
        .insert({
          customer_phone: testPhone,
          customer_name: testName,
          status: 'DRAFT',
          currency: 'BOB',
          products_json: [
            { name: 'Producto Demo A', quantity: 2, price: 50.0 },
            { name: 'Producto Demo B', quantity: 1, price: 75.0 },
          ],
          total_amount: 175.0,
          delivery_method: 'delivery',
          delivery_address: 'Calle Test 123, La Paz',
          created_at: now,
          updated_at: now,
        })
        .select('id')
        .single();

      if (orderError || !order) {
        request.log.error({ error: orderError }, 'Failed to create seed order');
        return reply.status(500).send({ error: 'Failed to create order', details: orderError?.message });
      }

      // Create payment in pending_review status
      const { data: payment, error: paymentError } = await supabaseAdmin
        .from('payments')
        .insert({
          order_id: order.id,
          tenant_id: config.TENANT_ID,
          reported_by_phone: testPhone,
          proof_media_id: null,
          proof_message_text: 'Comprobante enviado: TRANSFERENCIA 175Bs (seed)',
          reported_at: now,
          status: 'pending_review',
          vendor_decision: null,
        })
        .select('id')
        .single();

      if (paymentError || !payment) {
        request.log.error({ error: paymentError }, 'Failed to create seed payment');
        return reply.status(500).send({ error: 'Failed to create payment', details: paymentError?.message });
      }

      request.log.info({ orderId: order.id, paymentId: payment.id }, 'Seed payment review created');

      return reply.send({
        order_id: order.id,
        payment_id: payment.id,
        status: 'pending_review',
        customer_name: testName,
        customer_phone: testPhone,
      });
    } catch (error) {
      request.log.error({ error }, 'Seed payment review failed');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  // Simulate WhatsApp inbound message
  const SimulateInboundSchema = z.object({
    from_phone: z.string().min(1),
    text: z.string().min(1),
    media: z.object({
      kind: z.enum(['image', 'pdf', 'none']),
      url: z.string().optional(),
      base64: z.string().optional(),
      filename: z.string().optional(),
    }).optional(),
  });

  fastify.post('/simulate-inbound', async (request, reply) => {
    // Security: disabled unless explicitly enabled
    if (!ALLOW_DEBUG_SEEDS) {
      return reply.status(404).send({ error: 'Not found' });
    }

    // Security: require debug token header
    const token = request.headers['x-debug-token'];
    if (!DEBUG_SEED_TOKEN || token !== DEBUG_SEED_TOKEN) {
      return reply.status(404).send({ error: 'Not found' });
    }

    const parseResult = SimulateInboundSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Invalid request body', details: parseResult.error.issues });
    }

    const { from_phone, text, media } = parseResult.data;

    try {
      // Build a simulated WhatsApp message
      const simulatedMessageId = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      let simulatedMessage: WhatsAppMessage;

      if (media?.kind === 'image') {
        simulatedMessage = {
          from: from_phone,
          id: simulatedMessageId,
          timestamp: Math.floor(Date.now() / 1000).toString(),
          type: 'image',
          image: {
            caption: text,
            mime_type: 'image/jpeg',
            sha256: 'simulated_sha256',
            id: `sim_media_${Date.now()}`,
          },
        };
      } else {
        simulatedMessage = {
          from: from_phone,
          id: simulatedMessageId,
          timestamp: Math.floor(Date.now() / 1000).toString(),
          type: 'text',
          text: {
            body: text,
          },
        };
      }

      // Build a simulated contact
      const simulatedContact: WhatsAppContact = {
        profile: { name: `Simulated ${from_phone.slice(-4)}` },
        wa_id: from_phone,
      };

      request.log.info({ from_phone, text, media: media?.kind }, 'Processing simulated inbound message');

      // Process using the same pipeline as real webhooks
      const result = await processMessage(simulatedMessage, simulatedContact, request.log);

      request.log.info(result, 'Simulated message processed');

      return reply.send({
        success: true,
        conversation_id: result.conversationId,
        order_id: result.orderId,
        payment_id: result.paymentId,
        simulated_message_id: simulatedMessageId,
      });
    } catch (error) {
      request.log.error({ error }, 'Simulate inbound failed');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  // Queue a test outbound message
  const SendTestSchema = z.object({
    to_phone: z.string().min(1),
    body: z.string().min(1),
  });

  fastify.post('/send-test', async (request, reply) => {
    // Security: disabled unless explicitly enabled
    if (!ALLOW_DEBUG_SEEDS) {
      return reply.status(404).send({ error: 'Not found' });
    }

    // Security: require debug token header
    const token = request.headers['x-debug-token'];
    if (!DEBUG_SEED_TOKEN || token !== DEBUG_SEED_TOKEN) {
      return reply.status(404).send({ error: 'Not found' });
    }

    const parseResult = SendTestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Invalid request body', details: parseResult.error.issues });
    }

    const { to_phone, body } = parseResult.data;

    try {
      request.log.info({ to_phone, body }, 'Queueing test outbound message');

      const result = await enqueueOutboundMessage(
        {
          to_phone,
          body,
          message_type: 'text',
          metadata: { source: 'debug_send_test' },
        },
        request.log
      );

      if (!result) {
        return reply.status(500).send({ error: 'Failed to queue message' });
      }

      return reply.send({
        outbound_id: result.outbound_id,
        status: 'pending',
      });
    } catch (error) {
      request.log.error({ error }, 'Send test failed');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });
};
