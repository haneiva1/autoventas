import { FastifyInstance } from 'fastify';
import { processWebhookEvent } from '../services/webhook-processor.js';

export const webhookRoutes = async (fastify: FastifyInstance) => {

  // Meta verification
  fastify.get('/whatsapp', async (request, reply) => {
    const query: any = request.query;
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return reply.status(200).type('text/plain').send(challenge);
    }

    return reply.status(403).type('text/plain').send('Forbidden');
  });

  // Incoming WhatsApp webhook
  fastify.post('/whatsapp', async (request, reply) => {
    try {
      await processWebhookEvent(request.body as any, request.log);
      return reply.status(200).send();
    } catch (err) {
      request.log.error({ err }, '[WEBHOOK] Processor failed');
      return reply.status(500).send();
    }
  });
};
