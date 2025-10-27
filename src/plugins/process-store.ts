import fp from "fastify-plugin";
import { createProcessStore, ProcessStore } from "../lib/process-store";
import { upsertProcessStore } from "../repositories/process-store.repo";
import { clearAll } from "../lib/waitroom";

/**
 * Process store plugin. This decorates the Fastify instance with a process
 * store that uses an in-memory Map for immediate access and asynchronously
 * persists to the database. The waitroom is also cleared on shutdown.
 */

declare module "fastify" {
  interface FastifyInstance {
    processStore: ProcessStore;
  }
}

export default fp(async (app) => {
  // Create the process store with async DB persistence
  const store = createProcessStore((correlationId, data) => {
    return upsertProcessStore(app.db, correlationId, data).catch((err) => {
      app.log.error(
        { err, correlationId },
        "failed to persist process store to DB"
      );
    });
  });

  app.decorate("processStore", store);

  // Clear all pending waits on shutdown
  app.addHook("onClose", async () => {
    clearAll("server shutdown");
  });
});
