import { FastifyInstance } from "fastify";
import { z } from "zod";
import { readVars, completeWith, toBpmnError } from "./camunda";
import type { CompiledStep } from "./define-process";

/**
 * Service output can be either direct data or include HTTP status code override.
 *
 * Pattern 1 - Direct output (uses static HTTP config from step definition):
 *   return { field1: value1, field2: value2 };
 *
 * Pattern 2 - With HTTP status override (captures actual API response code):
 *   return { data: { field1: value1 }, http_status_code: 201 };
 *
 * The subscribeTopic wrapper automatically detects the pattern and:
 * - Extracts the actual data to complete the Camunda task
 * - Uses the HTTP status override in event logs if provided
 * - Propagates common identifier fields (customerId, userId, etc.) to next steps
 */
type ServiceOutput<O> = O | { data: O; http_status_code: number };

/**
 * Extract the actual data from a service output, handling both patterns.
 */
function extractData<O>(output: ServiceOutput<O>): O {
  if (output && typeof output === "object" && "data" in output) {
    return output.data;
  }
  return output as O;
}

/**
 * Extract HTTP status code override if provided.
 */
function extractHttpStatus<O>(output: ServiceOutput<O>): number | null {
  if (
    output &&
    typeof output === "object" &&
    "data" in output &&
    "http_status_code" in output
  ) {
    return output.http_status_code;
  }
  return null;
}

/**
 * Generic subscription helper for Camunda external tasks. This wrapper
 * encapsulates the common behaviour of parsing input variables, invoking
 * business logic, completing tasks, handling BPMN errors, handling
 * technical failures and writing event log entries with full database schema.
 * It significantly reduces boilerplate in individual task handlers.
 *
 * @param app The Fastify instance
 * @param cfg Configuration describing the topic and how to handle it
 */
export function subscribeTopic<I, O>(
  app: FastifyInstance,
  cfg: {
    topic: string;
    stepConfig: CompiledStep;
    processDefaults: {
      target_system: string;
      originating_system: string;
      process_name: string;
    };
    inSchema: z.ZodType<I>;
    service: (
      input: I,
      ctx: { app: FastifyInstance }
    ) => Promise<ServiceOutput<O>>;
    resultMessage?: (out: O) => string;
  }
): void {
  const {
    topic,
    stepConfig,
    processDefaults,
    inSchema,
    service,
    resultMessage,
  } = cfg;
  const { camundaClient } = app;

  camundaClient.subscribe(topic, async ({ task, taskService }) => {
    const started = Date.now();

    // Collect all variables from the task
    const vars = readVars(task);

    // Extract execution context from Camunda variables (set by start endpoint)
    const batch_id = (vars.batch_id as string) || "unknown-batch";
    const traceability_id = (vars.traceability_id as string) || "unknown-trace";
    const application_id = (vars.application_id as string) || "unknown-app";

    // Extract and parse identifiers object (can be extended by previous steps)
    let identifiers: Record<string, unknown> = {
      applicationId: application_id,
    };
    if (vars.identifiers && typeof vars.identifiers === "object") {
      identifiers = {
        ...identifiers,
        ...(vars.identifiers as Record<string, unknown>),
      };
    }

    // Base event log row with all required fields
    const baseLogRow = {
      batch_id,
      traceability_id,
      application_id,
      target_system: processDefaults.target_system,
      originating_system: processDefaults.originating_system,
      process_name: processDefaults.process_name,
      step: stepConfig.step,
      step_name: stepConfig.stepName,
      identifiers: JSON.stringify(identifiers),
      http_method: stepConfig.http_method ?? null,
      endpoint: stepConfig.endpoint ?? null,
    };

    try {
      // Validate input variables against the provided schema
      const parsed = inSchema.parse(vars);

      // Invoke business logic
      const serviceOutput = await service(parsed, { app });

      // Extract data and optional HTTP status override
      const out = extractData(serviceOutput);
      const httpStatusOverride = extractHttpStatus(serviceOutput);

      // Update identifiers if the service returned new ones
      let updatedIdentifiers = identifiers;
      if (out && typeof out === "object") {
        const outObj = out as Record<string, unknown>;
        // Check for common identifier fields that should be propagated
        const identifierFields = [
          "customerId",
          "userId",
          "orderId",
          "accountId",
        ];
        const newIdentifiers: Record<string, unknown> = {};
        for (const field of identifierFields) {
          if (field in outObj && outObj[field]) {
            newIdentifiers[field] = outObj[field];
          }
        }
        if (Object.keys(newIdentifiers).length > 0) {
          updatedIdentifiers = { ...identifiers, ...newIdentifiers };
        }
      }

      // Complete the task with output variables and updated identifiers
      await completeWith(taskService, task, {
        ...(out as unknown as Record<string, unknown>),
        identifiers: updatedIdentifiers,
      });

      // Write success event log entry
      await app.eventLog({
        ...baseLogRow,
        business_action_request: JSON.stringify(parsed),
        business_action_response: JSON.stringify(out),
        identifiers: JSON.stringify(updatedIdentifiers),
        result: stepConfig.success.result,
        http_status_code: httpStatusOverride,
        metadata: resultMessage
          ? JSON.stringify({ message: resultMessage(out) })
          : null,
        execution_time: Date.now() - started,
      });
    } catch (err) {
      const bpmn = toBpmnError(err);
      if (bpmn) {
        // Propagate BPMN error back to Camunda
        await taskService.handleBpmnError(task, bpmn.code, bpmn.message);
        await app.eventLog({
          ...baseLogRow,
          business_action_request: JSON.stringify(vars),
          business_action_response: JSON.stringify({ error: bpmn.message }),
          result: stepConfig.error.result,
          metadata: JSON.stringify(bpmn.details ?? {}),
          execution_time: Date.now() - started,
        });
        return;
      }

      // Unexpected error: treat as technical failure
      const message = err instanceof Error ? err.message : String(err);
      await taskService.handleFailure(task, {
        errorMessage: message,
        retries: 0,
        retryTimeout: 30_000,
      });
      await app.eventLog({
        ...baseLogRow,
        business_action_request: JSON.stringify(vars),
        business_action_response: JSON.stringify({ error: message }),
        result: "failure",
        metadata: JSON.stringify({ error: message }),
        execution_time: Date.now() - started,
      });
    }
  });
}
