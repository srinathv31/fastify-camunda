import { FastifyInstance } from "fastify";
import { subscribeTopic } from "../../../../../lib/subscribe-topic";
import { InVars, OutVars } from "./schema";
import { validateUserInformationService } from "./service";
import { ONBOARD_USER_STEPS, PROCESS_DEFAULTS } from "../../shared";

/**
 * Register the validate-user-information topic subscription. This function
 * should be called once at startup to wire the worker for this task.
 */
export function registerValidateUserInformation(app: FastifyInstance): void {
  const stepConfig = ONBOARD_USER_STEPS["validate-user-information"];
  subscribeTopic<InVars, OutVars>(app, {
    topic: "onboard-user.validate-user-information",
    stepConfig,
    processDefaults: PROCESS_DEFAULTS,
    inSchema: InVars,
    service: validateUserInformationService,
    resultMessage: (out) =>
      out.validated ? "user validated" : "user not validated",
  });
}
