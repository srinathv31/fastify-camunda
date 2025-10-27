import fp from 'fastify-plugin';
import pino from 'pino';

/**
 * Configure a pino logger for Fastify. This plugin replaces the default
 * Fastify logger with a custom instance. Redaction rules remove sensitive
 * data such as passwords and tokens from logs. In development the logs
 * are prettified for readability.
 */
export default fp(async (app) => {
  const isDev = app.config?.NODE_ENV === 'development';
  const logger = pino({
    level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
    redact: {
      paths: ['req.headers.authorization', '*.password', '*.token'],
      remove: true,
    },
    transport: isDev
      ? {
          target: 'pino-pretty',
          options: {
            singleLine: true,
            colorize: true,
          },
        }
      : undefined,
  });
  // Replace the logger on the Fastify instance. Casting to any is
  // necessary because app.log is not writable in the type definitions.
  (app as any).log = logger;
});