import { FastifyInstance } from "fastify";
import { subscribeTopic } from "../../../../../lib/subscribeTopic";
import { InVars, OutVars } from "./schema";
import { callOnboardingApiService } from "./service";
import { ONBOARD_USER_STEPS, PROCESS_DEFAULTS } from "../../shared";

/**
 * Register the call-onboarding-api topic subscription. This handler finalises
 * the onboard-user process by invoking the onboarding microservice and
 * recording whether the user has been successfully onboarded.
 */
export function registerCallOnboardingApi(app: FastifyInstance): void {
  const stepConfig = ONBOARD_USER_STEPS["call-onboarding-api"];
  subscribeTopic<InVars, OutVars>(app, {
    topic: "onboard-user.call-onboarding-api",
    stepConfig,
    processDefaults: PROCESS_DEFAULTS,
    inSchema: InVars,
    service: callOnboardingApiService,
    resultMessage: (out) =>
      out.onboarded
        ? "user onboarded"
        : `onboarding failed: ${out.reason ?? "unknown"}`,
  });
}
