import { z } from "zod";

/**
 * Input variables for the validate-user-information task. The external task
 * will provide these variables from the BPMN process. Additional
 * variables can be added here as your process evolves.
 * Note: System variables like application_id, batch_id, traceability_id are
 * extracted separately by subscribeTopic and don't need to be in the schema.
 */
export const InVars = z.object({
  userId: z.string(),
});

export type InVars = z.infer<typeof InVars>;

/**
 * Output variables for the validate-user-information task. These are set
 * back on the process instance by the worker. The BPMN process should
 * declare matching output mappings.
 */
export const OutVars = z.object({
  validated: z.boolean(),
  normalizedUserId: z.string(),
});

export type OutVars = z.infer<typeof OutVars>;
