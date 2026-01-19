import { FastifyPluginAsync } from 'fastify';
import { WhatsAppWebhookSchema } from '../schemas/whatsapp.js';
import { config } from '../lib/config.js';
import { processWebhookEvent } from '../services/webhook-processor.js';

export const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  // WhatsApp Cloud API verification endpoint (GET)
  // Meta sends hub.mode, hub.verify_token, hub.challenge as query params
  fastify.get('/whatsapp/verify', async (request, reply) => {
    const query = request.query as Record<string, string>;

    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode === 'subscribe' && token === 'ruah_verify_token_2026') {
      request.log.info('WhatsApp webhook verified successfully');
      return reply.type('text/plain').send(challenge);
    }

    request.log.warn({ mode, tokenProvided: !!token }, 'WhatsApp webhook verification failed');
    return reply.status(403).type('text/plain').send('Forbidden');
  });

  // Webhook verification (GET) - WhatsApp sends this to verify endpoint
  fastify.get('/whatsapp', async (request, reply) => {
    const query = request.query as Record<string, string>;

    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    // Verify token matches (placeholder - in production, use env var)
    const verifyToken = config.WHATSAPP_VERIFY_TOKEN || 'test-verify-token';

    if (mode === 'subscribe' && token === verifyToken) {
      request.log.info('Webhook verified successfully');
      return reply.send(challenge);
    }

    request.log.warn('Webhook verification failed');
    return reply.status(403).send('Forbidden');
  });

  // Webhook events (POST) - WhatsApp sends message events here
  fastify.post('/whatsapp', async (request, reply) => {
    const startTime = Date.now();

    // Validate payload shape
    const parseResult = WhatsAppWebhookSchema.safeParse(request.body);
    if (!parseResult.success) {
      request.log.warn({ errors: parseResult.error.issues }, 'Invalid webhook payload');
      return reply.status(400).send({ error: 'Invalid payload' });
    }

    const payload = parseResult.data;

    // TODO: Verify X-Hub-Signature-256 header when WHATSAPP_APP_SECRET is set
    // This is a placeholder for production security
    const signature = request.headers['x-hub-signature-256'];
    if (config.WHATSAPP_APP_SECRET && signature) {
      // In production: verify HMAC signature
      request.log.debug('Signature verification placeholder');
    }

    // Process asynchronously - return 200 quickly
    // Note: In production, use a queue (e.g., BullMQ) for reliability
    setImmediate(async () => {
      try {
        await processWebhookEvent(payload, request.log);
      } catch (error) {
        request.log.error({ error }, 'Failed to process webhook event');
      }
    });

    const duration = Date.now() - startTime;
    request.log.info({ duration }, 'Webhook received');

    return reply.status(200).send({ received: true });
  });
};
