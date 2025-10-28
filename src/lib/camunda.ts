import { Variables, TaskService, Task } from "camunda-external-task-client-js";
import { BusinessRuleError } from "./errors";

/**
 * Convert the variables of a Camunda task into a plain JavaScript object. The
 * returned object contains all process variables available on the task.
 */
export function readVars(task: Task): Record<string, unknown> {
  const all = task.variables.getAll();
  // Create a shallow copy to avoid accidental mutation of the underlying map.
  return { ...all };
}

/**
 * Complete a task with the provided output variables. The output object is
 * converted into a Variables instance which ensures the appropriate types
 * are sent back to Camunda.
 */
export async function completeWith(
  taskService: TaskService,
  task: Task,
  out: Record<string, unknown>
): Promise<void> {
  const vars = new Variables();
  for (const [k, v] of Object.entries(out)) {
    vars.set(k, v as any);
  }
  await taskService.complete(task, vars);
}

/**
 * Map an error to a BPMN error definition. This function converts all errors
 * into BPMN errors that can be handled by error boundary events in the process.
 * - BusinessRuleError: Uses custom error code
 * - Zod validation errors: VALIDATION_ERROR
 * - Generic errors: TECHNICAL_ERROR
 */
export function toBpmnError(err: unknown): {
  code: string;
  message: string;
  details?: Record<string, unknown>;
} {
  // Handle BusinessRuleError
  if (err instanceof BusinessRuleError) {
    return { code: err.code, message: err.message, details: err.details };
  }

  // Handle Zod validation errors
  if (
    err &&
    typeof err === "object" &&
    "name" in err &&
    err.name === "ZodError"
  ) {
    const zodErr = err as any;
    return {
      code: "VALIDATION_ERROR",
      message: "Input validation failed",
      details: { zodError: zodErr.errors || zodErr },
    };
  }

  // Handle generic errors
  const message = err instanceof Error ? err.message : String(err);
  return { code: "TECHNICAL_ERROR", message, details: {} };
}
