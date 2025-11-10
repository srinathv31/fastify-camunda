/**
 * Waitroom manages pending process requests that are waiting for completion.
 * Each wait is tracked by a correlation ID and includes a promise that can be
 * resolved (on success) or rejected (on error or timeout). This enables the
 * sync/async callback pattern where clients wait up to a timeout period for
 * process completion before falling back to polling.
 */

type Pending = {
  resolve: (v: any) => void;
  reject: (e: any) => void;
  timeout: NodeJS.Timeout;
};

const pending = new Map<string, Pending>();

/**
 * Create a wait for a process identified by correlationId. Returns a promise
 * that resolves when completeWait is called or rejects on timeout.
 *
 * @param correlationId Unique identifier for the process
 * @param ms Timeout in milliseconds
 * @returns Promise that resolves with the process result or rejects on timeout/error
 */
export function createWait(correlationId: string, ms: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(correlationId);
      const err = new Error("Process timeout") as any;
      err.code = "TIMEOUT";
      reject(err);
    }, ms);
    pending.set(correlationId, { resolve, reject, timeout });
  });
}

/**
 * Complete a pending wait with a successful result.
 *
 * @param correlationId The process identifier
 * @param payload The result data to return to the waiting client
 * @returns true if a pending wait was found and completed, false otherwise
 */
export function completeWait(correlationId: string, payload: any): boolean {
  const p = pending.get(correlationId);
  if (!p) return false;
  clearTimeout(p.timeout);
  pending.delete(correlationId);
  p.resolve(payload);
  return true;
}

/**
 * Fail a pending wait with an error.
 *
 * @param correlationId The process identifier
 * @param err The error to reject with
 * @returns true if a pending wait was found and failed, false otherwise
 */
export function failWait(correlationId: string, err: any): boolean {
  const p = pending.get(correlationId);
  if (!p) return false;
  clearTimeout(p.timeout);
  pending.delete(correlationId);
  p.reject(err);
  return true;
}

/**
 * Check if a wait is currently pending for a correlation ID.
 *
 * @param correlationId The process identifier
 * @returns true if a pending wait exists, false otherwise
 */
export function hasPendingWait(correlationId: string): boolean {
  return pending.has(correlationId);
}

/**
 * Get the count of all pending waits. Useful for debugging.
 *
 * @returns The number of currently pending waits
 */
export function getPendingCount(): number {
  return pending.size;
}

/**
 * Clear all pending waits. Called on server shutdown.
 *
 * @param reason Optional reason for the abort
 */
export function clearAll(reason = "shutdown"): void {
  for (const [_correlationId, p] of pending) {
    clearTimeout(p.timeout);
    p.reject(new Error(`Aborted: ${reason}`));
  }
  pending.clear();
}
