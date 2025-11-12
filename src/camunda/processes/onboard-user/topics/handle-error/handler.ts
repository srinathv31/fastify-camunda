import { FastifyInstance } from "fastify";
import { subscribeTopic } from "../../../../../lib/subscribe-topic";
import { InVars, OutVars } from "./schema";
import { handleErrorService } from "./service";
import { ONBOARD_USER_STEPS, PROCESS_DEFAULTS } from "../../shared";

/**
 * Register the handle-error topic subscription. This task is invoked when
 * any BPMN error occurs in the onboard-user process. It notifies the client
 * via the /api/process/complete endpoint and finalizes the process.
 */
export function registerHandleError(app: FastifyInstance): void {
  const stepConfig = ONBOARD_USER_STEPS["handle-error"];
  subscribeTopic<InVars, OutVars>(app, {
    topic: "onboard-user.handle-error",
    stepConfig,
    processDefaults: PROCESS_DEFAULTS,
    inSchema: InVars,
    service: handleErrorService,
    resultMessage: () => "error handled and client notified",
  });
}
