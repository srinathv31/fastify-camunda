import { ProcessData } from "../lib/process-store";

/**
 * Repository for process store database operations. This provides async
 * persistence for the in-memory process store.
 */

export interface Db {
  query: (sql: string, params?: unknown[]) => Promise<any[]>;
}

/**
 * Upsert a process record to the database. This is a fire-and-forget
 * operation called after updating the in-memory Map.
 *
 * @param db Database connection
 * @param correlationId Process identifier
 * @param data Process data to persist
 */
export async function upsertProcessStore(
  db: Db,
  correlationId: string,
  data: ProcessData
): Promise<void> {
  // TODO: Replace with actual MSSQL upsert/merge statement
  // For now this is a stub that logs the operation
  await db.query(
    `/* 
      MERGE INTO process_store AS target
      USING (VALUES (?, ?, ?, ?, ?, ?)) AS source (correlation_id, status, data, error, started_at, updated_at)
      ON target.correlation_id = source.correlation_id
      WHEN MATCHED THEN
        UPDATE SET status = source.status, data = source.data, error = source.error, updated_at = source.updated_at
      WHEN NOT MATCHED THEN
        INSERT (correlation_id, status, data, error, started_at, updated_at)
        VALUES (source.correlation_id, source.status, source.data, source.error, source.started_at, source.updated_at);
    */`,
    [
      correlationId,
      data.status,
      data.data ? JSON.stringify(data.data) : null,
      data.error ?? null,
      data.startedAt,
      data.updatedAt,
    ]
  );
}

/**
 * Find a single process by correlation ID.
 *
 * @param db Database connection
 * @param correlationId Process identifier
 */
export async function findProcessStore(
  db: Db,
  correlationId: string
): Promise<ProcessData | null> {
  // TODO: Replace with actual SELECT query
  const result = await db.query(
    "/* SELECT correlation_id, status, data, error, started_at, updated_at FROM process_store WHERE correlation_id = ? */",
    [correlationId]
  );

  if (result.length === 0) {
    return null;
  }

  const row = result[0];
  return {
    status: row.status,
    data: row.data ? JSON.parse(row.data) : undefined,
    error: row.error,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Find all active processes in the database.
 *
 * @param db Database connection
 */
export async function findAllProcessStore(db: Db): Promise<ProcessData[]> {
  // TODO: Replace with actual SELECT query
  const result = await db.query(
    "/* SELECT correlation_id, status, data, error, started_at, updated_at FROM process_store ORDER BY updated_at DESC */"
  );

  return result.map((row) => ({
    status: row.status,
    data: row.data ? JSON.parse(row.data) : undefined,
    error: row.error,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
  }));
}
