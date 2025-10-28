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
 * Handle a BPMN error with the provided variables. Similar to completeWith but
 * for error scenarios. The variables are converted into a Variables instance
 * and passed to Camunda along with the error code and message.
 */
export async function handleBpmnErrorWith(
  taskService: TaskService,
  task: Task,
  errorCode: string,
  errorMessage: string,
  vars?: Record<string, unknown>
): Promise<void> {
  if (vars) {
    const variables = new Variables();
    for (const [k, v] of Object.entries(vars)) {
      variables.set(k, v as any);
    }
    await taskService.handleBpmnError(task, errorCode, errorMessage, variables);
  } else {
    await taskService.handleBpmnError(task, errorCode, errorMessage);
  }
}

/**
 * Map an error to a BPMN error definition. This function converts all errors
 * into BPMN errors that can be handled by error boundary events in the process.
 * All errors use EMPLOYEE_CARD_ERROR as the code to match the BPMN error boundary,
 * with specific error types preserved in the details object.
 */
export function toBpmnError(err: unknown): {
  code: string;
  message: string;
  details?: Record<string, unknown>;
} {
  // Use single error code for all errors to match BPMN error boundary
  const errorCode = "EMPLOYEE_CARD_ERROR";

  // Handle BusinessRuleError
  if (err instanceof BusinessRuleError) {
    return {
      code: errorCode,
      message: err.message,
      details: {
        errorType: err.code,
        ...err.details,
      },
    };
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
      code: errorCode,
      message: "Input validation failed",
      details: {
        errorType: "VALIDATION_ERROR",
        zodError: zodErr.errors || zodErr,
      },
    };
  }

  // Handle generic errors
  const message = err instanceof Error ? err.message : String(err);
  return {
    code: errorCode,
    message,
    details: {
      errorType: "TECHNICAL_ERROR",
    },
  };
}
