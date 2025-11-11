/**
 * Waitroom manages pending process requests that are waiting for completion.
 * Instead of using an in-memory Map, this implementation polls the database
 * with exponential backoff to check for process completion. This enables the
 * sync/async callback pattern across multiple server instances and survives
 * server restarts.
 */

import {
  pollProcessStore,
  completeProcessStore,
  failProcessStore,
} from "../repositories/process-store.repo";
import { Db } from "../repositories/process-store.repo";

/**
 * Create a wait for a process identified by correlationId. Returns a promise
 * that resolves when the process completes or rejects on timeout.
 * Uses scoped polling with exponential backoff (50ms → 100ms → 250ms → 500ms → 1000ms cap).
 *
 * @param db Database connection
 * @param correlationId Unique identifier for the process
 * @param timeoutMs Timeout in milliseconds
 * @returns Promise that resolves with the process result or rejects on timeout/error
 */
export async function createWait(
  db: Db,
  correlationId: string,
  timeoutMs: number
): Promise<any> {
  const start = Date.now();
  let delay = 50; // Start with 50ms, will grow: 50 → 100 → 250 → 500 → 1000ms (cap)

  while (Date.now() - start < timeoutMs) {
    try {
      const processData = await pollProcessStore(db, correlationId);

      if (processData) {
        // Map DONE/ERROR back to ok/error for compatibility
        const normalizedStatus =
          processData.status === "pending"
            ? "pending"
            : processData.status.toLowerCase() === "done"
            ? "ok"
            : "error";

        if (normalizedStatus === "ok") {
          return processData.data ?? null;
        }

        if (normalizedStatus === "error") {
          const err = new Error(
            processData.error ?? "Onboarding process failed"
          );
          throw err;
        }

        // Still pending, continue polling
      }
    } catch (lockTimeoutError) {
      // If we hit a lock timeout (rare), just continue to next poll
      // The lock timeout is set to 200ms in the repository
    }

    // Wait before next poll with exponential backoff
    await new Promise((res) => setTimeout(res, delay));
    delay = Math.min(delay * 2, 1000); // Cap at 1000ms
  }

  // Timed out waiting
  const err = new Error("Process timeout") as any;
  err.code = "TIMEOUT";
  throw err;
}

/**
 * Complete a pending wait with a successful result.
 * Updates the database row to DONE status.
 *
 * @param db Database connection
 * @param correlationId The process identifier
 * @param payload The result data to return to the waiting client
 * @returns true if update was successful, false otherwise
 */
export async function completeWait(
  db: Db,
  correlationId: string,
  payload: any
): Promise<boolean> {
  try {
    await completeProcessStore(db, correlationId, payload);
    return true;
  } catch (err) {
    // Log error but return false to indicate failure
    console.error("Failed to complete wait:", err);
    return false;
  }
}

/**
 * Fail a pending wait with an error.
 * Updates the database row to ERROR status.
 *
 * @param db Database connection
 * @param correlationId The process identifier
 * @param err The error to reject with
 * @returns true if update was successful, false otherwise
 */
export async function failWait(
  db: Db,
  correlationId: string,
  err: any
): Promise<boolean> {
  try {
    await failProcessStore(db, correlationId, err);
    return true;
  } catch (error) {
    // Log error but return false to indicate failure
    console.error("Failed to fail wait:", error);
    return false;
  }
}

/**
 * Check if a wait is currently pending for a correlation ID.
 * Queries the database to check if status is PENDING.
 *
 * @param db Database connection
 * @param correlationId The process identifier
 * @returns true if a pending wait exists, false otherwise
 */
export async function hasPendingWait(
  db: Db,
  correlationId: string
): Promise<boolean> {
  try {
    const processData = await pollProcessStore(db, correlationId);
    return processData?.status === "pending";
  } catch {
    return false;
  }
}

/**
 * Get the count of all pending waits. Useful for debugging.
 *
 * @param db Database connection
 * @returns The number of currently pending waits
 */
export async function getPendingCount(db: Db): Promise<number> {
  try {
    const result = await db.query(
      "SELECT COUNT(*) as count FROM dbo.process_store WHERE status = 'PENDING';"
    );
    return result[0]?.count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Clear all pending waits. Called on server shutdown.
 * Updates all PENDING rows to ERROR status.
 *
 * @param db Database connection
 * @param reason Optional reason for the abort
 */
export async function clearAll(db: Db, reason = "shutdown"): Promise<void> {
  try {
    await db.query(
      `UPDATE dbo.process_store 
       SET status = 'ERROR', 
           error_json = @p1, 
           updated_at = SYSUTCDATETIME()
       WHERE status = 'PENDING';`,
      [JSON.stringify({ message: `Aborted: ${reason}` })]
    );
  } catch (err) {
    console.error("Failed to clear all waits:", err);
  }
}
