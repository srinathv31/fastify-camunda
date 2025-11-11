import { FastifyPluginAsync } from "fastify";
import { randomUUID } from "crypto";
import { createWait } from "../../lib/waitroom";
import { startProcessInstance } from "../../services/camunda-rest.service";

/**
 * Route for starting a new process. This endpoint accepts a process key,
 * correlation ID and variables, starts the process in Camunda, and waits
 * for completion up to a configurable timeout. If the process completes
 * within the timeout, returns 200 with the result. Otherwise returns 202
 * with a status URL for polling.
 */

const startRoute: FastifyPluginAsync = async (app) => {
  app.post<{
    Body: {
      processKey: string;
      correlationId: string;
      variables?: Record<string, any>;
    };
    Reply: any;
  }>(
    "/start",
    {
      schema: {
        body: {
          type: "object",
          required: ["processKey", "correlationId"],
          properties: {
            processKey: { type: "string", minLength: 1 },
            correlationId: { type: "string", minLength: 1 },
            variables: { type: "object" },
          },
        },
      },
    },
    async (req, reply) => {
      const { processKey, correlationId, variables } = req.body;
      const SYNC_TIMEOUT_MS = app.config.SYNC_TIMEOUT_MS;

      // Generate per-request execution context IDs
      const batch_id = randomUUID();
      const traceability_id = randomUUID();
      const application_id = randomUUID();

      // Initialize identifiers object with applicationId
      const identifiers = { applicationId: application_id };

      // Save initial status to process store
      await app.processStore.save(correlationId, {
        status: "pending",
        data: { step: "queued" },
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      try {
        // Convert variables to Camunda format, including execution context
        const camundaVars: Record<
          string,
          { value: any; type: string; serializationDataFormat?: string }
        > = {
          correlationId: { value: correlationId, type: "String" },
          batch_id: { value: batch_id, type: "String" },
          traceability_id: { value: traceability_id, type: "String" },
          application_id: { value: application_id, type: "String" },
          identifiers: {
            value: JSON.stringify(identifiers),
            type: "Json",
            serializationDataFormat: "application/json",
          },
        };

        // if (variables) {
        //   for (const [key, value] of Object.entries(variables)) {
        //     // Infer Camunda type from JS type
        //     let type = "String";
        //     if (typeof value === "number") {
        //       type = Number.isInteger(value) ? "Integer" : "Double";
        //     } else if (typeof value === "boolean") {
        //       type = "Boolean";
        //     } else if (typeof value === "object") {
        //       type = "Json";
        //     }
        //     camundaVars[key] = { value, type };
        //   }
        // }

        // Start the process in Camunda
        const processInstance = await startProcessInstance(
          app.config.CAMUNDA_BASE_URL,
          {
            key: processKey,
            businessKey: correlationId,
            variables: camundaVars,
          }
        );

        req.log.info(
          { correlationId, processInstanceId: processInstance.id },
          "process started in Camunda"
        );

        // Wait for completion with timeout
        const result = await createWait(app.db, correlationId, SYNC_TIMEOUT_MS);

        // Process completed within timeout
        return reply.code(200).send({
          status: "ok",
          correlationId,
          result,
        });
      } catch (e: any) {
        if (e?.code === "TIMEOUT") {
          // Process is still running - return 202 with status URL
          return reply.code(202).send({
            status: "pending",
            correlationId,
            statusUrl: `/api/process/status/${correlationId}`,
          });
        }

        // Unexpected error
        req.log.error({ err: e, correlationId }, "process start failed");
        await app.processStore.save(correlationId, {
          status: "error",
          error: String(e?.message ?? e),
        });
        return reply.code(500).send({
          status: "error",
          correlationId,
          error: String(e?.message ?? e),
        });
      }
    }
  );
};

export default startRoute;
