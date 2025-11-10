import fp from "fastify-plugin";
import { z } from "zod";
import dotenv from "dotenv";
import { join } from "path";

/**
 * Define the shape of environment variables. Using zod allows us to
 * validate and coerce values at startup. If the schema fails to parse
 * the environment, the application will log an error and exit.
 */
const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "sit", "pat", "production"])
    .default("development"),
  PORT: z.coerce.number().optional(),
  CAMUNDA_BASE_URL: z
    .string()
    .url()
    .default("http://localhost:8080/engine-rest"),
  CAMUNDA_MAX_TASKS: z.coerce.number().default(10),
  CAMUNDA_LOCK_DURATION_MS: z.coerce.number().default(20_000),
  CAMUNDA_ASYNC_RESPONSE_TIMEOUT_MS: z.coerce.number().default(30_000),
  SYNC_TIMEOUT_MS: z.coerce.number().default(25_000),
  DB_HOST: z.string().optional(),
  DB_NAME: z.string().optional(),
  DB_USER: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
});

declare module "fastify" {
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
 *
 * This plugin loads .env files in the following priority order (later files override earlier ones):
 * 1. .env (base configuration)
 * 2. .env.local (local overrides, ignored by git)
 * 3. .env.[NODE_ENV] (environment-specific, e.g., .env.development, .env.sit, .env.pat, .env.production)
 * 4. .env.[NODE_ENV].local (environment-specific local overrides)
 */
export default fp(async (app) => {
  // Determine environment from process.env.NODE_ENV (default to "development")
  const nodeEnv = process.env.NODE_ENV || "development";

  // Resolve project root (use process.cwd() which always points to where the process was started)
  const projectRoot = process.cwd();

  // Load .env files in priority order (later files override earlier ones)
  // 1. Base .env file
  dotenv.config({ path: join(projectRoot, ".env") });

  // 2. Local overrides (ignored by git)
  dotenv.config({ path: join(projectRoot, ".env.local"), override: true });

  // 3. Environment-specific file
  dotenv.config({ path: join(projectRoot, `.env.${nodeEnv}`), override: true });

  // 4. Environment-specific local overrides
  dotenv.config({
    path: join(projectRoot, `.env.${nodeEnv}.local`),
    override: true,
  });

  // Parse and validate the environment variables
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    app.log.error(
      { issues: parsed.error.issues },
      "Invalid environment variables"
    );
    throw new Error("ENV_VALIDATION_FAILED");
  }
  app.decorate("config", parsed.data);
});
