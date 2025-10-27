import { InVars, OutVars } from "./schema";
import { FastifyInstance } from "fastify";

/**
 * Service implementation for the prepare-response task. This is the final
 * step in the onboard-user process that aggregates all results and calls
 * the /api/process/complete endpoint to finalize the process and wake any
 * waiting clients.
 */
export async function prepareResponseService(
  input: InVars,
  ctx: { app: FastifyInstance }
): Promise<OutVars> {
  const {
    correlationId,
    userId,
    validated,
    backgroundCheckPassed,
    onboarded,
    riskScore,
    reason,
  } = input;

  // Determine overall success
  const success = validated && backgroundCheckPassed && onboarded;

  // Prepare response data
  const responseData = {
    userId,
    validated,
    backgroundCheckPassed,
    onboarded,
    riskScore,
    reason,
    success,
  };

  try {
    // Call the process/complete endpoint to finalize the process
    // Using localhost since we're calling our own API
    const port = ctx.app.config?.PORT ?? 8080;
    const response = await fetch(
      `http://localhost:${port}/api/process/complete`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          correlationId,
          status: success ? "ok" : "error",
          data: success ? responseData : undefined,
          error: success ? undefined : reason ?? "Onboarding process failed",
        }),
      }
    );

    if (!response.ok) {
      ctx.app.log.error(
        { correlationId, statusCode: response.status },
        "failed to call process/complete endpoint"
      );
    } else {
      ctx.app.log.info({ correlationId }, "process completion callback sent");
    }

    return { completed: true };
  } catch (err) {
    ctx.app.log.error(
      { err, correlationId },
      "failed to send completion callback"
    );
    // Return completed:true anyway - we don't want to fail the Camunda task
    // The process store will remain in pending state until timeout
    return { completed: true };
  }
}
