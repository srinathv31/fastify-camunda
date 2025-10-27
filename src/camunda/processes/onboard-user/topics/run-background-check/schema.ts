import { z } from 'zod';

/**
 * Input variables for the run-background-check task. These values are
 * provided by the previous task and the BPMN process. The validated
 * flag indicates whether the user information passed validation.
 */
export const InVars = z.object({
  userId: z.string(),
  validated: z.boolean(),
  applicationId: z.string().uuid().optional(),
});

export type InVars = z.infer<typeof InVars>;

/**
 * Output variables for the run-background-check task. The riskScore
 * simulates a numerical risk rating and is returned along with a boolean
 * indicating whether the background check passed.
 */
export const OutVars = z.object({
  backgroundCheckPassed: z.boolean(),
  riskScore: z.number().int().min(0).max(100),
});

export type OutVars = z.infer<typeof OutVars>;