/**
 * A stub repository for writing event log entries. In this scaffold we
 * rely on the event-log plugin to write to the database directly so this
 * repository is unused. It is included here to illustrate where your
 * application-specific persistence logic would live.
 */
export const EventLogRepo = {
  async insert(_entry: Record<string, unknown>): Promise<void> {
    // Implement your MSSQL insert here.
  },
};