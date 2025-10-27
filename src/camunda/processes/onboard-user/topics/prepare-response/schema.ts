import { z } from "zod";

/**
 * Input and output variable schemas for the prepare-response task.
 * This final task aggregates all previous results and calls the
 * process/complete endpoint to finalize the process.
 */

export const InVars = z.object({
  correlationId: z.string(),
  userId: z.string(),
  validated: z.boolean(),
  backgroundCheckPassed: z.boolean(),
  onboarded: z.boolean(),
  riskScore: z.number().optional(),
  reason: z.string().optional(),
});

export type InVars = z.infer<typeof InVars>;

export const OutVars = z.object({
  completed: z.boolean(),
});

export type OutVars = z.infer<typeof OutVars>;
