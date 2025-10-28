import { z } from "zod";

/**
 * Input variables for the handle-error task. This task is invoked when any
 * BPMN error occurs in the process. It receives the correlation ID and error
 * details to notify the client via the /api/process/complete endpoint.
 */
export const InVars = z.object({
  correlationId: z.string(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
});

export type InVars = z.infer<typeof InVars>;

/**
 * Output variables for the handle-error task. This indicates whether the
 * error was successfully handled and the client was notified.
 */
export const OutVars = z.object({
  errorHandled: z.boolean(),
});

export type OutVars = z.infer<typeof OutVars>;
