import pino from 'pino';
import { config } from './config.js';

// Redact sensitive fields from logs
const redactPaths = [
  'req.headers.authorization',
  'req.headers["x-hub-signature-256"]',
  '*.wa_phone',
  '*.customer_phone',
  '*.phone',
  '*.customer_name',
];

export const logger = pino({
  level: config.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: {
    paths: redactPaths,
    censor: '[REDACTED]',
  },
  transport:
    config.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: { colorize: true },
        }
      : undefined,
});
