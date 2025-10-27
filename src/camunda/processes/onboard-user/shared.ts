import { defineProcess } from "../../../lib/define-process";

/**
 * Process-level defaults for the onboard-user process. These values are
 * consistent across all steps in the process.
 */
export const PROCESS_DEFAULTS = {
  target_system: "CamundaEngine",
  originating_system: "FastifyAPI",
  process_name: "onboard-user",
} as const;

/**
 * Complete configuration for the onboard-user process including step order,
 * HTTP metadata, and success/error messages. This provides type-safe access
 * to all step metadata needed for event logging.
 */
export const ONBOARD_USER_PROCESS = defineProcess([
  "validate-user-information",
  "run-background-check",
  "call-onboarding-api",
  "prepare-response",
] as const)({
  "validate-user-information": {
    http_method: null,
    endpoint: null,
    success: { result: "User information validated" },
    error: { result: "User information validation failed" },
  },
  "run-background-check": {
    http_method: "POST",
    endpoint: "/background-check/verify",
    success: { result: "Background check completed" },
    error: { result: "Background check failed" },
  },
  "call-onboarding-api": {
    http_method: "POST",
    endpoint: "/onboarding/complete",
    success: { result: "Onboarding API call successful" },
    error: { result: "Onboarding API call failed" },
  },
  "prepare-response": {
    http_method: null,
    endpoint: null,
    success: { result: "Response prepared" },
    error: { result: "Response preparation failed" },
  },
});

/**
 * Type-safe step name extracted from the process definition.
 */
export type OnboardUserStepName =
  (typeof ONBOARD_USER_PROCESS.stepsInOrder)[number];

/**
 * Compiled step configurations for easy lookup.
 */
export const ONBOARD_USER_STEPS = ONBOARD_USER_PROCESS.compiled;
