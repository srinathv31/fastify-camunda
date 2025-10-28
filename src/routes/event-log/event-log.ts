import { FastifyPluginAsync } from "fastify";
import { EventLogRow } from "../../plugins/event-log";

/**
 * Routes for checking process status. These endpoints allow clients to
 * poll for process completion after receiving a 202 response from the
 * start endpoint.
 */

const eventLogRoute: FastifyPluginAsync = async (app) => {
  /**
   * Get the event log for a single process by traceability ID.
   */
  app.get<{ Params: { traceabilityId: string } }>(
    "/event-log/:traceabilityId",
    {
      schema: {
        params: {
          type: "object",
          properties: {
            traceabilityId: { type: "string" },
          },
          required: ["traceabilityId"],
        },
      },
    },
    async (req, reply) => {
      const { traceabilityId } = req.params;

      try {
        const eventLog = await app.db.query<EventLogRow>(
          "SELECT * FROM event_log WHERE traceability_id = @p1 ORDER BY step ASC",
          [traceabilityId]
        );

        return reply.code(200).send({
          eventLog,
        });
      } catch (err) {
        app.log.error({ err, traceabilityId }, "Error getting event log");
        return reply.code(500).send({
          message: "Error getting event log",
          ...(process.env.NODE_ENV === "development" && {
            error: (err as Error).message,
          }),
        });
      }
    }
  );
};

export default eventLogRoute;
