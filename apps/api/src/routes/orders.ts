import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';

const OrderIdSchema = z.object({
  id: z.string().uuid(),
});

export const ordersRoutes: FastifyPluginAsync = async (fastify) => {
  // Get order detail
  fastify.get('/:id', async (request, reply) => {
    const params = OrderIdSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'Invalid order ID' });
    }

    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', params.data.id)
      .single();

    if (error || !data) {
      return reply.status(404).send({ error: 'Order not found' });
    }

    return reply.send({ order: data });
  });

  // List orders with optional status filter
  fastify.get('/', async (request, reply) => {
    const query = request.query as { status?: string };

    let queryBuilder = supabaseAdmin
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (query.status) {
      queryBuilder = queryBuilder.eq('status', query.status);
    }

    const { data, error } = await queryBuilder;

    if (error) {
      request.log.error({ error }, 'Failed to fetch orders');
      return reply.status(500).send({ error: 'Database error' });
    }

    return reply.send({ orders: data });
  });
};
