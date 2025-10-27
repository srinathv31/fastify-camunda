import { Variables, TaskService, Task } from 'camunda-external-task-client-js';
import { BusinessRuleError } from './errors';

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
  out: Record<string, unknown>,
): Promise<void> {
  const vars = new Variables();
  for (const [k, v] of Object.entries(out)) {
    vars.set(k, v as any);
  }
  await taskService.complete(task, vars);
}

/**
 * Map an error to a BPMN error definition if it is a BusinessRuleError. The
 * returned object contains an error code and message used by Camunda to
 * propagate BPMN errors. Non-business exceptions return null.
 */
export function toBpmnError(
  err: unknown,
): { code: string; message: string; details?: Record<string, unknown> } | null {
  if (err instanceof BusinessRuleError) {
    return { code: err.code, message: err.message, details: err.details };
  }
  return null;
}