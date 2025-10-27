import { FastifyInstance } from 'fastify';
import { subscribeTopic } from '../../../../../lib/subscribeTopic';
import { InVars, OutVars, InVars as ValidateInVars } from './schema';
import { validateUserInformationService } from './service';
import { ONBOARD_USER_STEPS } from '../../shared';

/**
 * Register the validate-user-information topic subscription. This function
 * should be called once at startup to wire the worker for this task.
 */
export function registerValidateUserInformation(app: FastifyInstance): void {
  const { step, stepName } = ONBOARD_USER_STEPS['validate-user-information'];
  subscribeTopic<InVars, OutVars>(app, {
    topic: 'onboard-user.validate-user-information',
    step,
    stepName,
    inSchema: InVars,
    service: validateUserInformationService,
    resultMessage: (out) => (out.validated ? 'user validated' : 'user not validated'),
  });
}