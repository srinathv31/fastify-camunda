import { FastifyPluginAsync } from "fastify";
import { completeWait, failWait } from "../../lib/waitroom";

/**
 * Route for completing a process. This endpoint is called by the final
 * Camunda task (prepare-response) to signal that the process has finished.
 * It updates the process store, wakes any waiting clients, and removes
 * the process from the in-memory Map.
 */

const completeRoute: FastifyPluginAsync = async (app) => {
  app.post<{
    Body: {
      correlationId: string;
      status: "ok" | "error";
      data?: any;
      error?: string;
    };
  }>(
    "/complete",
    {
      schema: {
        body: {
          type: "object",
          required: ["correlationId", "status"],
          properties: {
            correlationId: { type: "string", minLength: 1 },
            status: { type: "string", enum: ["ok", "error"] },
            data: {},
            error: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      const { correlationId, status, data, error } = req.body;

      // Update the process store with final result
      await app.processStore.save(correlationId, {
        status,
        data,
        error,
      });

      // Wake any waiting clients
      const woke =
        status === "ok"
          ? await completeWait(app.db, correlationId, data ?? null)
          : await failWait(
              app.db,
              correlationId,
              new Error(error ?? "Unknown process error")
            );

      req.log.info(
        { correlationId, woke, status },
        "process completion received"
      );

      // Remove from in-memory Map after a short delay to allow status checks
      // to retrieve the final result
      setTimeout(() => {
        app.processStore.remove(correlationId).catch((err) => {
          req.log.error(
            { err, correlationId },
            "failed to remove process from store"
          );
        });
      }, 5000);

      // Always return 200 to avoid Camunda retry loops
      return reply.code(200).send({ received: true });
    }
  );
};

export default completeRoute;
