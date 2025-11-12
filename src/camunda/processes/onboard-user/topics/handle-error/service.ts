import { InVars, OutVars } from "./schema";
import { FastifyInstance } from "fastify";

/**
 * Service implementation for the handle-error task. This is invoked when
 * any BPMN error occurs in the process (validation errors, technical errors,
 * or business rule errors). It calls the /api/process/complete endpoint with
 * error status to wake any waiting clients and finalize the process.
 */
export async function handleErrorService(
  input: InVars,
  ctx: { app: FastifyInstance }
): Promise<OutVars> {
  const { correlationId, errorCode, errorMessage, errorType } = input;

  // errorMessage comes from Camunda variables set by handleBpmnErrorWith
  const errorToReport = errorMessage ?? "Process failed";

  ctx.app.log.info(
    { correlationId, errorCode, errorType, errorMessage: errorToReport },
    "handling process error"
  );

  try {
    const port = ctx.app.config?.PORT ?? 8080;
    const response = await fetch(
      `http://localhost:${port}/api/process/complete`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          correlationId,
          status: "error",
          error: errorToReport,
        }),
      }
    );

    if (!response.ok) {
      ctx.app.log.error(
        { correlationId, statusCode: response.status },
        "failed to call complete endpoint from error handler"
      );
      return { errorHandled: false };
    }

    ctx.app.log.info({ correlationId }, "error handler completed successfully");
    return { errorHandled: true };
  } catch (err) {
    ctx.app.log.error(
      { err, correlationId },
      "error handler failed to notify client"
    );
    return { errorHandled: false };
  }
}
