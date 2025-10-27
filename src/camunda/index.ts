import { FastifyInstance } from "fastify";
import { registerValidateUserInformation } from "./processes/onboard-user/topics/validate-user-information/handler";
import { registerRunBackgroundCheck } from "./processes/onboard-user/topics/run-background-check/handler";
import { registerCallOnboardingApi } from "./processes/onboard-user/topics/call-onboarding-api/handler";
import { registerPrepareResponse } from "./processes/onboard-user/topics/prepare-response/handler";

/**
 * Register all Camunda topic subscriptions. Each call wires up a
 * subscriber for a BPMN external task. New processes and tasks should
 * register their own handlers here.
 */
export async function registerCamundaSubscriptions(
  app: FastifyInstance
): Promise<void> {
  registerValidateUserInformation(app);
  registerRunBackgroundCheck(app);
  registerCallOnboardingApi(app);
  registerPrepareResponse(app);
}
