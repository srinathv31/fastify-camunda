import fp from 'fastify-plugin';

/**
 * Definition of an event log entry. Each entry captures the step number and
 * human-friendly name, a correlation identifier (business key), the result
 * type and optional details such as a message or duration. Extend this
 * interface if you need additional fields in your log table.
 */
export interface EventLogInput {
  step: number;
  stepName: string;
  correlationId: string;
  result: 'success' | 'bpmn_error' | 'failure';
  message?: string;
  details?: Record<string, unknown>;
  durationMs?: number;
}

declare module 'fastify' {
  interface FastifyInstance {
    /**
     * Write an entry to the event log. This function is safe to call
     * anywhere in your application. It is asynchronous but errors are
     * caught and logged internally.
     */
    eventLog(entry: EventLogInput): Promise<void>;
  }
}

export default fp(async (app) => {
  app.decorate('eventLog', async (entry: EventLogInput) => {
    try {
      // TODO: Replace this stub query with an actual insert into your
      // MSSQL database. The parameters array aligns with columns in the
      // event log table.
      await app.db.query(
        '/* insert into event_log (correlation_id, step, step_name, result, message, details, duration_ms) values (?, ?, ?, ?, ?, ?, ?) */',
        [
          entry.correlationId,
          entry.step,
          entry.stepName,
          entry.result,
          entry.message ?? null,
          entry.details ? JSON.stringify(entry.details) : null,
          entry.durationMs ?? null,
        ],
      );
      app.log.info({ entry }, 'event logged');
    } catch (err) {
      app.log.error({ err, entry }, 'failed to write event log');
    }
  });
});