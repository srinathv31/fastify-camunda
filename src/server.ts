import fastify from "fastify";
import autoload from "@fastify/autoload";
import { join } from "path";
import env from "./plugins/env";
import logger from "./plugins/logger";
import db from "./plugins/db";
import eventLog from "./plugins/event-log";
import processStore from "./plugins/process-store";
import camundaClient from "./plugins/camunda-client";
import { registerCamundaSubscriptions } from "./camunda";

/**
 * Build the Fastify application. This function registers all plugins
 * and Camunda topic subscriptions but does not start listening on a port.
 * It is exported separately to allow tests to construct an instance
 * without binding to the network.
 */
export async function build() {
  // Create the Fastify instance with logging enabled. Note that a logger
  // plugin will override the default logger later.
  const app = fastify({ logger: true });

  // Register environment parsing first so subsequent plugins can read
  // configuration from app.config. Order matters here.
  await app.register(env);
  // Register a custom logger. This will replace the default logger on
  // the Fastify instance with our configured pino instance.
  await app.register(logger);
  // Register the database plugin. This creates app.db with a query() method.
  await app.register(db, {
    config: {
      user: app.config.DB_USER!,
      password: app.config.DB_PASSWORD!,
      server: app.config.DB_HOST!,
      database: app.config.DB_NAME!,
      options: {
        encrypt: false,
        trustServerCertificate: true,
      },
      pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    },
  });
  // Register the event log plugin. This decorates app.eventLog to write
  // structured entries for each completed or failed task.
  await app.register(eventLog);
  // Register the process store plugin. This creates app.processStore for
  // tracking active processes with in-memory Map and async DB persistence.
  await app.register(processStore);
  // Register the Camunda client. This creates app.camundaClient used to
  // subscribe to external tasks.
  // await app.register(camundaClient);

  // Auto-load all routes from the routes directory
  await app.register(autoload, {
    dir: join(__dirname, "routes"),
    options: { prefix: "/api/process" },
  });

  // Register all topic subscriptions. These subscriptions will not be
  // activated until after the Camunda client has been registered.
  // await registerCamundaSubscriptions(app);

  return app;
}
