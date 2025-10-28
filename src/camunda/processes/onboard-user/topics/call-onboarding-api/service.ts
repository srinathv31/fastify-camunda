import { InVars, OutVars } from "./schema";
import { FastifyInstance } from "fastify";
import { BusinessRuleError } from "../../../../../lib/errors";
import { http } from "../../../../../services/http.service";
import { ServiceOutput } from "../../../../../lib/subscribe-topic";

/**
 * Service implementation for the call-onboarding-api task. This step
 * finalises the onboard-user process by invoking an external onboarding
 * microservice. It ensures that previous steps have succeeded and
 * derives a final outcome based on the mocked API call.
 */
export async function callOnboardingApiService(
  input: InVars,
  ctx: { app: FastifyInstance }
): Promise<ServiceOutput<OutVars>> {
  const { userId, validated, backgroundCheckPassed, riskScore } = input;
  // Both previous conditions must be satisfied to proceed.
  if (!validated) {
    throw new BusinessRuleError(
      "VALIDATION_REQUIRED",
      "User must be validated before onboarding"
    );
  }
  if (!backgroundCheckPassed) {
    // We can return a negative onboarding result without throwing a BPMN error.
    return { onboarded: false, reason: "Background check failed" };
  }
  try {
    // Simulate an API call. Replace with real HTTP request to your
    // onboarding service. It may return additional context such as
    // account IDs or tokens.
    const res = await http.post("/onboarding", { body: { userId, riskScore } });
    const body = res?.body ?? {};
    // Use the mock response if available; otherwise derive onboarding
    // success based on the risk score threshold. Lower scores are more
    // likely to succeed.
    const apiOnboarded: boolean | undefined = body?.onboarded;
    const apiReason: string | undefined = body?.reason;
    const customerId: string | undefined = body?.customerId; // Example: capture customerId for identifiers
    const onboarded =
      typeof apiOnboarded === "boolean" ? apiOnboarded : riskScore < 75;
    const reason = onboarded
      ? undefined
      : apiReason ?? "Risk score too high to onboard";

    // Example: Return with HTTP status code override to capture actual API response
    // The subscribeTopic wrapper will use this status in the event log
    // and also automatically extract customerId into the identifiers object
    return {
      data: { onboarded, reason, customerId },
      http_status_code: res?.statusCode ?? 200,
    };
  } catch (err) {
    // Technical failure: propagate as an exception which subscribeTopic
    // will treat as a retryable failure.
    throw new Error("Failed to call onboarding API");
  }
}
