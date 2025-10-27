/**
 * A BusinessRuleError signals that a process-specific business rule was
 * violated. Throwing this error from a service function will cause
 * `subscribeTopic` to propagate the error as a BPMN error to Camunda.
 */
export class BusinessRuleError extends Error {
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'BusinessRuleError';
    this.code = code;
    this.details = details;
  }
}