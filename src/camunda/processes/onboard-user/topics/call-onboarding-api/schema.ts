import { z } from 'zod';

/**
 * Input variables for the call-onboarding-api task. It receives the
 * cumulative state from previous tasks including validation and
 * background check results and the risk score computed earlier.
 */
export const InVars = z.object({
  userId: z.string(),
  validated: z.boolean(),
  backgroundCheckPassed: z.boolean(),
  riskScore: z.number().int().min(0).max(100),
  applicationId: z.string().uuid().optional(),
});

export type InVars = z.infer<typeof InVars>;

/**
 * Output variables for the call-onboarding-api task. The boolean
 * `onboarded` indicates success and an optional `reason` explains
 * failures.
 */
export const OutVars = z.object({
  onboarded: z.boolean(),
  reason: z.string().optional(),
});

export type OutVars = z.infer<typeof OutVars>;