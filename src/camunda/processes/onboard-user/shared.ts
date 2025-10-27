/**
 * Mapping of task keys to their step numbers and human-friendly names for
 * the onboard-user process. This is used when logging events so the
 * sequence of steps is explicit and consistent.
 */
export const ONBOARD_USER_STEPS: Record<
  'validate-user-information' | 'run-background-check' | 'call-onboarding-api',
  { step: number; stepName: string }
> = {
  'validate-user-information': { step: 1, stepName: 'Validate User Information' },
  'run-background-check': { step: 2, stepName: 'Run Background Check' },
  'call-onboarding-api': { step: 3, stepName: 'Call Onboarding API' },
};