import { FastifyInstance } from 'fastify';
import { subscribeTopic } from '../../../../../lib/subscribeTopic';
import { InVars, OutVars } from './schema';
import { runBackgroundCheckService } from './service';
import { ONBOARD_USER_STEPS } from '../../shared';

/**
 * Register the run-background-check topic subscription. This worker executes
 * after the user information has been validated and determines if the
 * applicant passes a background check.
 */
export function registerRunBackgroundCheck(app: FastifyInstance): void {
  const { step, stepName } = ONBOARD_USER_STEPS['run-background-check'];
  subscribeTopic<InVars, OutVars>(app, {
    topic: 'onboard-user.run-background-check',
    step,
    stepName,
    inSchema: InVars,
    service: runBackgroundCheckService,
    resultMessage: (out) => `backgroundCheckPassed=${out.backgroundCheckPassed}`,
  });
}