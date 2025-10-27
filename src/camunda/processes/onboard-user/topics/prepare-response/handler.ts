import { FastifyInstance } from "fastify";
import { subscribeTopic } from "../../../../../lib/subscribeTopic";
import { InVars, OutVars } from "./schema";
import { prepareResponseService } from "./service";
import { ONBOARD_USER_STEPS } from "../../shared";

/**
 * Register the prepare-response topic subscription. This is the final handler
 * in the onboard-user process that aggregates all results and calls the
 * process/complete endpoint to finalize the process.
 */
export function registerPrepareResponse(app: FastifyInstance): void {
  const { step, stepName } = ONBOARD_USER_STEPS["prepare-response"];
  subscribeTopic<InVars, OutVars>(app, {
    topic: "onboard-user.prepare-response",
    step,
    stepName,
    inSchema: InVars,
    service: prepareResponseService,
    resultMessage: () => "response prepared and process completed",
  });
}
