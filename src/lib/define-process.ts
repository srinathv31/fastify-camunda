/**
 * Type-safe process definition utility for configuring steps with their
 * metadata, HTTP details, and success/error messages. This provides
 * compile-time guarantees that all steps have complete configuration.
 */

export type ScenarioConfig = {
  result: string;
};

export type StepConfig = {
  http_method?: string | null;
  endpoint?: string | null;
  success: ScenarioConfig;
  error: ScenarioConfig;
};

export type CompiledStep = {
  step: number;
  stepName: string;
  http_method?: string | null;
  endpoint?: string | null;
  success: ScenarioConfig;
  error: ScenarioConfig;
};

/**
 * Defines a process with an ordered list of steps and their configurations.
 * This function locks the steps as a literal tuple and enforces that the
 * config has exactly those keys with complete StepConfig objects.
 *
 * @param stepsInOrder Array of step names in execution order
 * @returns A function that accepts the configuration object
 *
 * @example
 * ```typescript
 * export const myProcess = defineProcess([
 *   "validate-input",
 *   "call-external-api",
 *   "prepare-response"
 * ] as const)({
 *   "validate-input": {
 *     success: { result: "Input validated" },
 *     error: { result: "Input validation failed" }
 *   },
 *   "call-external-api": {
 *     http_method: "POST",
 *     endpoint: "/api/external",
 *     success: { result: "API call successful" },
 *     error: { result: "API call failed" }
 *   },
 *   "prepare-response": {
 *     success: { result: "Response prepared" },
 *     error: { result: "Response preparation failed" }
 *   }
 * });
 * ```
 */
export function defineProcess<const TSteps extends readonly string[]>(
  stepsInOrder: TSteps
) {
  type StepName = TSteps[number];

  return function withConfig<
    const TConfig extends Record<StepName, StepConfig>
  >(config: TConfig) {
    // Compile the configuration into a lookup map with step numbers
    const compiled: Record<StepName, CompiledStep> = {} as Record<
      StepName,
      CompiledStep
    >;

    stepsInOrder.forEach((stepName, index) => {
      const cfg = config[stepName];
      compiled[stepName] = {
        step: index + 1, // 1-based indexing
        stepName: stepName as string,
        http_method: cfg.http_method ?? null,
        endpoint: cfg.endpoint ?? null,
        success: cfg.success,
        error: cfg.error,
      };
    });

    return {
      stepsInOrder,
      config,
      compiled,
    };
  };
}
