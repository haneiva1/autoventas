import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { config } from './lib/config.js';
import { logger } from './lib/logger.js';
import { webhookRoutes } from './routes/webhooks.js';
import { paymentsRoutes } from './routes/payments.js';
import { ordersRoutes } from './routes/orders.js';
import { debugRoutes } from './routes/debug.js';

async function buildApp() {
  const app = Fastify({
    logger: logger,
  });

  // Register plugins
  await app.register(cors, {
    origin: true, // Allow all origins in dev; restrict in production
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    // Different limits for different routes can be set per-route
  });

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Register routes
  await app.register(webhookRoutes, { prefix: '/webhooks' });
  await app.register(paymentsRoutes, { prefix: '/api/payments' });
  await app.register(ordersRoutes, { prefix: '/api/orders' });
  await app.register(debugRoutes, { prefix: '/api/debug' });

  return app;
}

async function start() {
  const app = await buildApp();

  try {
    await app.listen({ port: config.API_PORT, host: '0.0.0.0' });
    logger.info(`Server listening on port ${config.API_PORT}`);
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

start();
