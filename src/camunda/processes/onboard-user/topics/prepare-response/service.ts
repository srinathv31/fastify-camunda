import {
  completeWait,
  failWait,
  hasPendingWait,
  getPendingCount,
} from "../../../../../lib/waitroom";
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
  const startTime = Date.now();
  const {
    correlationId,
    userId,
    validated,
    backgroundCheckPassed,
    onboarded,
    riskScore,
    reason,
  } = input;

  // Log entry with detailed context
  ctx.app.log.info(
    {
      correlationId,
      userId,
      validated,
      backgroundCheckPassed,
      onboarded,
      riskScore,
      reason,
      pendingWaitsCount: await getPendingCount(ctx.app.db),
      hasPendingWait: await hasPendingWait(ctx.app.db, correlationId),
    },
    "prepareResponseService: started"
  );

  // Determine overall success
  const success = validated && backgroundCheckPassed && onboarded;
  const status = success ? "ok" : "error";

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
    // Get the process start time from the store to calculate TOTAL elapsed time
    const processData = await ctx.app.processStore.get(correlationId);
    const processStartTime = processData?.startedAt
      ? new Date(processData.startedAt).getTime()
      : null;
    const totalElapsedSinceStart = processStartTime
      ? Date.now() - processStartTime
      : null;

    // Update the process store with final result
    const storeStartTime = Date.now();
    await ctx.app.processStore.save(correlationId, {
      status: success ? "ok" : "error",
      data: responseData,
      error: success ? undefined : reason ?? "Onboarding process failed",
    });
    const storeDuration = Date.now() - storeStartTime;

    ctx.app.log.info(
      { correlationId, storeDuration },
      "prepareResponseService: processStore.save completed"
    );

    // Check if there's a pending wait before attempting to wake
    const hadPendingWait = await hasPendingWait(ctx.app.db, correlationId);

    // Wake any waiting clients
    const woke =
      status === "ok"
        ? await completeWait(ctx.app.db, correlationId, responseData ?? null)
        : await failWait(
            ctx.app.db,
            correlationId,
            new Error(reason ?? "Onboarding process failed")
          );

    const serviceDuration = Date.now() - startTime;
    const SYNC_TIMEOUT_MS = ctx.app.config.SYNC_TIMEOUT_MS;
    const totalDuration = totalElapsedSinceStart ?? serviceDuration;
    const approachingTimeout = totalDuration > SYNC_TIMEOUT_MS * 0.8;

    // Log completion with detailed diagnostics
    ctx.app.log.info(
      {
        correlationId,
        userId,
        status,
        woke,
        hadPendingWait,
        totalElapsedSinceStart,
        serviceDuration,
        totalDuration,
        SYNC_TIMEOUT_MS,
        approachingTimeout,
        pendingWaitsCount: await getPendingCount(ctx.app.db),
      },
      "prepareResponseService: process completion handled"
    );

    // Critical: Log if we couldn't wake a client
    if (!woke && hadPendingWait) {
      ctx.app.log.error(
        {
          correlationId,
          hadPendingWait,
          totalElapsedSinceStart,
          serviceDuration,
          totalDuration,
          SYNC_TIMEOUT_MS,
        },
        "prepareResponseService: CRITICAL - had pending wait but completeWait/failWait returned false (possible race condition)"
      );
    } else if (!woke && !hadPendingWait) {
      ctx.app.log.warn(
        {
          correlationId,
          totalElapsedSinceStart,
          serviceDuration,
          totalDuration,
          SYNC_TIMEOUT_MS,
          timeoutExceeded: totalDuration > SYNC_TIMEOUT_MS,
        },
        "prepareResponseService: no pending wait found (client likely timed out or not waiting)"
      );
    }

    // Warn if process duration is approaching or exceeding timeout
    if (approachingTimeout) {
      ctx.app.log.warn(
        {
          correlationId,
          totalElapsedSinceStart,
          serviceDuration,
          totalDuration,
          SYNC_TIMEOUT_MS,
          percentOfTimeout: Math.round((totalDuration / SYNC_TIMEOUT_MS) * 100),
        },
        "prepareResponseService: process duration approaching/exceeding timeout threshold"
      );
    }

    // Remove from in-memory Map after a short delay to allow status checks
    // to retrieve the final result
    setTimeout(() => {
      ctx.app.processStore.remove(correlationId).catch((err) => {
        ctx.app.log.error(
          { err, correlationId },
          "prepareResponseService: failed to remove process from store"
        );
      });
    }, 5000);

    return { completed: true };
  } catch (err) {
    const serviceDuration = Date.now() - startTime;

    // Try to get total elapsed time even in error case
    let totalElapsedSinceStart = null;
    try {
      const processData = await ctx.app.processStore.get(correlationId);
      const processStartTime = processData?.startedAt
        ? new Date(processData.startedAt).getTime()
        : null;
      totalElapsedSinceStart = processStartTime
        ? Date.now() - processStartTime
        : null;
    } catch {
      // Ignore errors when fetching timing in error handler
    }

    ctx.app.log.error(
      {
        err,
        correlationId,
        userId,
        totalElapsedSinceStart,
        serviceDuration,
        SYNC_TIMEOUT_MS: ctx.app.config.SYNC_TIMEOUT_MS,
        errorType: err instanceof Error ? err.constructor.name : typeof err,
        errorMessage: err instanceof Error ? err.message : String(err),
      },
      "prepareResponseService: CRITICAL - exception during process completion"
    );
    // Return completed:true anyway - we don't want to fail the Camunda task
    // The process store will remain in pending state until timeout
    return { completed: true };
  }
}
