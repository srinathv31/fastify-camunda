import fp from "fastify-plugin";
import { createProcessStore, ProcessStore } from "../lib/process-store";
import { clearAll } from "../lib/waitroom";

/**
 * Process store plugin. This decorates the Fastify instance with a process
 * store that directly reads/writes to the database for multi-instance support.
 * The waitroom is also cleared on shutdown.
 */

declare module "fastify" {
  interface FastifyInstance {
    processStore: ProcessStore;
  }
}

export default fp(async (app) => {
  // Create the process store with DB connection
  const store = createProcessStore(app.db);

  app.decorate("processStore", store);

  // Clear all pending waits on shutdown
  app.addHook("onClose", async () => {
    await clearAll(app.db, "server shutdown");
  });
});
