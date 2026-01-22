import { FastifyInstance } from 'fastify';
import { processWebhookEvent } from '../services/webhook-processor';

export async function whatsappV2Routes(fastify: FastifyInstance) {
  fastify.post('/whatsapp', async (request, reply) => {
    try {
      await processWebhookEvent(request.body as any, request.log);
    } catch (err) {
      request.log.error({ err }, '[V2] Failed to process webhook');
    }
    reply.send({ ok: true });
  });
}
