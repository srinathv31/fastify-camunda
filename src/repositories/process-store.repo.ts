import { ProcessData } from "../lib/process-store";

/**
 * Repository for process store database operations. This provides async
 * persistence and polling support for the waitroom pattern.
 */

export interface Db {
  query: (sql: string, params?: unknown[]) => Promise<any[]>;
}

/**
 * Upsert a process record to the database with PENDING status.
 * Uses UPDLOCK/HOLDLOCK to prevent race conditions on the same correlation_id.
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
  const sql = `
    BEGIN TRAN;

    UPDATE dbo.process_store WITH (UPDLOCK, HOLDLOCK)
    SET 
      status = @p2,
      payload_json = @p3,
      error_json = @p4,
      updated_at = SYSUTCDATETIME()
    WHERE correlation_id = @p1;

    IF @@ROWCOUNT = 0
    BEGIN
      INSERT INTO dbo.process_store (correlation_id, status, payload_json, error_json, started_at, updated_at)
      VALUES (@p1, @p2, @p3, @p4, SYSUTCDATETIME(), SYSUTCDATETIME());
    END

    COMMIT TRAN;
  `;

  await db.query(sql, [
    correlationId,
    data.status.toUpperCase(), // PENDING, DONE, ERROR
    data.data ? JSON.stringify(data.data) : null,
    data.error ?? null,
  ]);
}

/**
 * Update process to DONE status with payload.
 *
 * @param db Database connection
 * @param correlationId Process identifier
 * @param payload Result data
 */
export async function completeProcessStore(
  db: Db,
  correlationId: string,
  payload: any
): Promise<void> {
  const sql = `
    UPDATE dbo.process_store
    SET 
      status = 'DONE',
      payload_json = @p2,
      error_json = NULL,
      updated_at = SYSUTCDATETIME()
    WHERE correlation_id = @p1;
  `;

  await db.query(sql, [correlationId, JSON.stringify(payload)]);
}

/**
 * Update process to ERROR status with error details.
 *
 * @param db Database connection
 * @param correlationId Process identifier
 * @param error Error message or object
 */
export async function failProcessStore(
  db: Db,
  correlationId: string,
  error: any
): Promise<void> {
  const errorJson =
    typeof error === "string"
      ? { message: error }
      : { message: error.message || "Unknown error", ...error };

  const sql = `
    UPDATE dbo.process_store
    SET 
      status = 'ERROR',
      error_json = @p2,
      payload_json = NULL,
      updated_at = SYSUTCDATETIME()
    WHERE correlation_id = @p1;
  `;

  await db.query(sql, [correlationId, JSON.stringify(errorJson)]);
}

/**
 * Poll for process completion. Reads a single row with minimal locking.
 * Uses READCOMMITTEDLOCK to prevent dirty reads while keeping lock duration short.
 *
 * @param db Database connection
 * @param correlationId Process identifier
 */
export async function pollProcessStore(
  db: Db,
  correlationId: string
): Promise<ProcessData | null> {
  // Set short lock timeout to avoid blocking
  await db.query("SET LOCK_TIMEOUT 200;");

  const sql = `
    SELECT 
      status, 
      payload_json, 
      error_json,
      started_at,
      updated_at
    FROM dbo.process_store WITH (READCOMMITTEDLOCK, ROWLOCK)
    WHERE correlation_id = @p1;
  `;

  const result = await db.query(sql, [correlationId]);

  if (result.length === 0) {
    return null;
  }

  const row = result[0];
  return {
    status: row.status.toLowerCase() as "pending" | "ok" | "error",
    data: row.payload_json ? JSON.parse(row.payload_json) : undefined,
    error: row.error_json ? JSON.parse(row.error_json).message : undefined,
    startedAt: row.started_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
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
  const sql = `
    SELECT 
      status, 
      payload_json, 
      error_json, 
      started_at, 
      updated_at 
    FROM dbo.process_store 
    WHERE correlation_id = @p1;
  `;

  const result = await db.query(sql, [correlationId]);

  if (result.length === 0) {
    return null;
  }

  const row = result[0];
  return {
    status: row.status.toLowerCase() as "pending" | "ok" | "error",
    data: row.payload_json ? JSON.parse(row.payload_json) : undefined,
    error: row.error_json ? JSON.parse(row.error_json).message : undefined,
    startedAt: row.started_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * Find all active processes in the database.
 *
 * @param db Database connection
 */
export async function findAllProcessStore(
  db: Db
): Promise<Array<{ correlationId: string; data: ProcessData }>> {
  const sql = `
    SELECT 
      correlation_id,
      status, 
      payload_json, 
      error_json, 
      started_at, 
      updated_at 
    FROM dbo.process_store 
    ORDER BY updated_at DESC;
  `;

  const result = await db.query(sql);

  return result.map((row) => ({
    correlationId: row.correlation_id,
    data: {
      status: row.status.toLowerCase() as "pending" | "ok" | "error",
      data: row.payload_json ? JSON.parse(row.payload_json) : undefined,
      error: row.error_json ? JSON.parse(row.error_json).message : undefined,
      startedAt: row.started_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    },
  }));
}

/**
 * Delete a process from the database.
 *
 * @param db Database connection
 * @param correlationId Process identifier
 */
export async function deleteProcessStore(
  db: Db,
  correlationId: string
): Promise<void> {
  const sql = `
    DELETE FROM dbo.process_store
    WHERE correlation_id = @p1;
  `;

  await db.query(sql, [correlationId]);
}
