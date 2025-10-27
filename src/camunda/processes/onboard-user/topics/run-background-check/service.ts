import { InVars, OutVars } from './schema';
import { FastifyInstance } from 'fastify';
import { BusinessRuleError } from '../../../../../lib/errors';
import { http } from '../../../../../services/http.service';

/**
 * Service implementation for the run-background-check task. This function
 * performs a mock call to a background check microservice. It first
 * verifies that the previous step (validate-user-information) succeeded.
 * If not, it throws a BusinessRuleError which becomes a BPMN error. A
 * real implementation would use the `http` service to call an external
 * API and return the response.
 */
export async function runBackgroundCheckService(
  input: InVars,
  ctx: { app: FastifyInstance },
): Promise<OutVars> {
  const { userId, validated } = input;
  // If the user has not been validated, stop the process with a BPMN error.
  if (!validated) {
    throw new BusinessRuleError('VALIDATION_REQUIRED', 'User must be validated before running background check');
  }
  try {
    // Simulate an HTTP call. Replace this with a real request to your
    // background check service. The `http` helper returns an object with
    // a `body` property containing the parsed JSON response.
    const res = await http.get('/background-check', { searchParams: { userId } });
    const body = res?.body ?? {};
    const passed = typeof body.passed === 'boolean' ? body.passed : Math.random() > 0.2;
    const riskScore = typeof body.score === 'number' ? body.score : Math.floor(Math.random() * 101);
    return {
      backgroundCheckPassed: passed,
      riskScore,
    };
  } catch (err) {
    // Propagate technical failures. Camunda will handle retries based on
    // retry configuration if any. In this stub we simply throw an Error.
    throw new Error('Failed to execute background check');
  }
}