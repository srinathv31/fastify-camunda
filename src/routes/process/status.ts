import { FastifyPluginAsync } from "fastify";

/**
 * Routes for checking process status. These endpoints allow clients to
 * poll for process completion after receiving a 202 response from the
 * start endpoint.
 */

const statusRoute: FastifyPluginAsync = async (app) => {
  /**
   * Get the status of a single process by correlation ID.
   */
  app.get<{ Params: { correlationId: string } }>(
    "/status/:correlationId",
    {
      schema: {
        params: {
          type: "object",
          properties: {
            correlationId: { type: "string" },
          },
          required: ["correlationId"],
        },
      },
    },
    async (req, reply) => {
      const { correlationId } = req.params;
      const processData = await app.processStore.get(correlationId);

      if (!processData) {
        return reply.code(404).send({
          status: "not_found",
          correlationId,
        });
      }

      // Return appropriate status code based on process state
      const statusCode =
        processData.status === "ok"
          ? 200
          : processData.status === "error"
          ? 500
          : 202;

      return reply.code(statusCode).send({
        status: processData.status,
        correlationId,
        data: processData.data,
        error: processData.error,
        startedAt: processData.startedAt,
        updatedAt: processData.updatedAt,
      });
    }
  );

  /**
   * Get all processes in the store. Useful for debugging.
   */
  app.get("/status/all", async (_req, reply) => {
    const processes = await app.processStore.values();
    return reply.code(200).send({
      count: processes.length,
      processes,
    });
  });
};

export default statusRoute;
