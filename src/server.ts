import fastify from 'fastify';
import env from './plugins/env';
import logger from './plugins/logger';
import db from './plugins/db';
import eventLog from './plugins/event-log';
import camundaClient from './plugins/camunda-client';
import { registerCamundaSubscriptions } from './camunda';

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
  await app.register(db);
  // Register the event log plugin. This decorates app.eventLog to write
  // structured entries for each completed or failed task.
  await app.register(eventLog);
  // Register the Camunda client. This creates app.camundaClient used to
  // subscribe to external tasks.
  await app.register(camundaClient);

  // Register all topic subscriptions. These subscriptions will not be
  // activated until after the Camunda client has been registered.
  await registerCamundaSubscriptions(app);

  return app;
}