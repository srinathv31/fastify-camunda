import fp from 'fastify-plugin';
import { Client, logger as CamundaLogger } from 'camunda-external-task-client-js';

declare module 'fastify' {
  interface FastifyInstance {
    /**
     * A single Camunda external task client instance. Use this to
     * subscribe to topics and handle tasks. The client is configured
     * based on environment variables provided via the env plugin.
     */
    camundaClient: Client;
  }
}

export default fp(async (app) => {
  const {
    CAMUNDA_BASE_URL,
    CAMUNDA_MAX_TASKS,
    CAMUNDA_LOCK_DURATION_MS,
    CAMUNDA_ASYNC_RESPONSE_TIMEOUT_MS,
  } = app.config;

  const client = new Client({
    baseUrl: CAMUNDA_BASE_URL,
    asyncResponseTimeout: CAMUNDA_ASYNC_RESPONSE_TIMEOUT_MS,
    maxTasks: CAMUNDA_MAX_TASKS,
    lockDuration: CAMUNDA_LOCK_DURATION_MS,
    // Forward Camunda worker logs to console. This uses the built-in logger from
    // camunda-external-task-client-js which outputs basic information about
    // subscriptions and failures.
    use: CamundaLogger,
  });

  app.decorate('camundaClient', client);

  // Stop the client when the Fastify server is closed. The client library
  // does not provide a public API to close the poller, so we call a
  // non-documented stop method if available. This prevents new tasks from
  // being fetched during shutdown.
  app.addHook('onClose', async () => {
    try {
      (client as any).stop?.();
    } catch (err) {
      // ignore errors on shutdown
    }
  });
});