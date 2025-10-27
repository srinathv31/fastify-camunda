import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { readVars, completeWith, toBpmnError } from './camunda';

/**
 * Generic subscription helper for Camunda external tasks. This wrapper
 * encapsulates the common behaviour of parsing input variables, invoking
 * business logic, completing tasks, handling BPMN errors, handling
 * technical failures and writing event log entries. It significantly
 * reduces boilerplate in individual task handlers.
 *
 * @param app The Fastify instance
 * @param cfg Configuration describing the topic and how to handle it
 */
export function subscribeTopic<I, O>(
  app: FastifyInstance,
  cfg: {
    topic: string;
    step: number;
    stepName: string;
    inSchema: z.ZodType<I>;
    service: (input: I, ctx: { app: FastifyInstance }) => Promise<O>;
    resultMessage?: (out: O) => string;
  },
): void {
  const { topic, step, stepName, inSchema, service, resultMessage } = cfg;
  const { camundaClient } = app;
  camundaClient.subscribe(topic, async ({ task, taskService }) => {
    const started = Date.now();
    // Collect all variables from the task.
    const vars = readVars(task);
    // Derive a correlation identifier for logging. Prefer the business key
    // but fall back to common variable names.
    const correlationId =
      (task.businessKey as string | undefined) ||
      (vars.correlationId as string | undefined) ||
      (vars.traceability_id as string | undefined) ||
      (vars.applicationId as string | undefined) ||
      'unknown';
    const baseLog = { step, stepName, correlationId };
    try {
      // Validate input variables against the provided schema. Zod throws
      // on failure which is caught below and treated as a BPMN error.
      const parsed = inSchema.parse(vars);
      // Invoke business logic. Pass the Fastify instance for access to
      // services, repositories and plugins.
      const out = await service(parsed, { app });
      // Complete the task with output variables.
      await completeWith(taskService, task, out as unknown as Record<string, unknown>);
      // Write a success event log entry.
      await app.eventLog({
        ...baseLog,
        result: 'success',
        message: resultMessage ? resultMessage(out) : `${topic} completed`,
        durationMs: Date.now() - started,
        details: {
          outPreview: Object.fromEntries(
            Object.entries(out as Record<string, unknown>).map(([k, v]) => {
              if (typeof v === 'string' && v.length > 100) {
                return [k, v.slice(0, 100) + '…'];
              }
                return [k, v];
            }),
          ),
        },
      });
    } catch (err) {
      const bpmn = toBpmnError(err);
      if (bpmn) {
        // Propagate BPMN error back to Camunda. Camunda will catch this and
        // route the process to an error boundary if defined.
        await taskService.handleBpmnError(task, bpmn.code, bpmn.message, bpmn.details);
        await app.eventLog({
          ...baseLog,
          result: 'bpmn_error',
          message: bpmn.message,
          durationMs: Date.now() - started,
          details: bpmn.details,
        });
        return;
      }
      // Unexpected error: treat as technical failure. No retries in this
      // stub implementation (retries=0 means Camunda stops retrying).
      const message = err instanceof Error ? err.message : String(err);
      await taskService.handleFailure(task, message, 0, 30_000);
      await app.eventLog({
        ...baseLog,
        result: 'failure',
        message,
        durationMs: Date.now() - started,
        details: { error: message },
      });
    }
  });
}