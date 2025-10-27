import fp from 'fastify-plugin';
import { z } from 'zod';

/**
 * Define the shape of environment variables. Using zod allows us to
 * validate and coerce values at startup. If the schema fails to parse
 * the environment, the application will log an error and exit.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().optional(),
  CAMUNDA_BASE_URL: z.string().url().default('http://localhost:8080/engine-rest'),
  CAMUNDA_MAX_TASKS: z.coerce.number().default(10),
  CAMUNDA_LOCK_DURATION_MS: z.coerce.number().default(20_000),
  CAMUNDA_ASYNC_RESPONSE_TIMEOUT_MS: z.coerce.number().default(30_000),
  DB_HOST: z.string().optional(),
  DB_NAME: z.string().optional(),
  DB_USER: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
});

declare module 'fastify' {
  interface FastifyInstance {
    /**
     * Parsed environment configuration available on the Fastify instance.
     */
    config: z.infer<typeof EnvSchema>;
  }
}

/**
 * Fastify plugin to parse and validate environment variables. The parsed
 * configuration is decorated on the Fastify instance as `app.config`.
 */
export default fp(async (app) => {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    app.log.error({ issues: parsed.error.issues }, 'Invalid environment variables');
    throw new Error('ENV_VALIDATION_FAILED');
  }
  app.decorate('config', parsed.data);
});