import { InVars, OutVars } from './schema';
import { FastifyInstance } from 'fastify';
import { BusinessRuleError } from '../../../../../lib/errors';

/**
 * Service implementation for the validate-user-information task. This
 * function encapsulates all business logic for the step. It uses the
 * Fastify instance from the context to access plugins such as the
 * database. To simulate a real system, this stub always returns
 * `validated: true` and echoes a normalized user ID. In a real
 * implementation you would perform DB lookups and possibly call
 * downstream services.
 */
export async function validateUserInformationService(
  input: InVars,
  ctx: { app: FastifyInstance },
): Promise<OutVars> {
  const { userId } = input;

  // Simulate a database lookup. Replace this with a real call to
  // `ctx.app.db.query(...)` when integrating with MSSQL. If the user
  // does not exist you could throw a BusinessRuleError to produce a BPMN
  // error in the process.
  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const result = await ctx.app.db.query('/* lookup user */', [userId]);
    // Pretend that if the userId contains "invalid" then the user cannot be validated.
    if (userId.toLowerCase().includes('invalid')) {
      throw new BusinessRuleError('VALIDATION_FAILED', `User ${userId} failed validation`);
    }
    return {
      validated: true,
      normalizedUserId: userId.trim().toLowerCase(),
    };
  } catch (err) {
    if (err instanceof BusinessRuleError) {
      throw err;
    }
    // Unexpected errors propagate as technical failures.
    throw new Error('Failed to validate user information');
  }
}