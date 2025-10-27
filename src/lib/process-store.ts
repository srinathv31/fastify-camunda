/**
 * Process store provides an in-memory Map for tracking active processes.
 * This is the primary data structure for fast access to process status.
 * The database acts as an async persistence layer for durability.
 */

export interface ProcessData {
  status: "pending" | "ok" | "error";
  data?: any;
  error?: string;
  startedAt: string;
  updatedAt: string;
}

/**
 * Create a new process store instance. The store is backed by an in-memory
 * Map and provides methods for saving, retrieving and removing processes.
 * The database write callback is optional and should be fire-and-forget.
 */
export function createProcessStore(
  dbWrite?: (correlationId: string, data: ProcessData) => Promise<void>
) {
  const store = new Map<string, ProcessData>();

  return {
    /**
     * Save or update a process in the store. Immediately updates the Map
     * and asynchronously persists to database if provided.
     */
    async save(
      correlationId: string,
      data: Partial<ProcessData>
    ): Promise<void> {
      const existing = store.get(correlationId);
      const now = new Date().toISOString();
      const updated: ProcessData = {
        status: data.status ?? existing?.status ?? "pending",
        data: data.data ?? existing?.data,
        error: data.error ?? existing?.error,
        startedAt: existing?.startedAt ?? now,
        updatedAt: now,
      };
      store.set(correlationId, updated);

      // Fire-and-forget DB write
      if (dbWrite) {
        dbWrite(correlationId, updated).catch(() => {
          // Errors already logged by the DB layer
        });
      }
    },

    /**
     * Get a process from the store by correlation ID.
     */
    async get(correlationId: string): Promise<ProcessData | undefined> {
      return store.get(correlationId);
    },

    /**
     * Remove a process from the in-memory store. Typically called when
     * a process completes to free memory.
     */
    async remove(correlationId: string): Promise<void> {
      store.delete(correlationId);
    },

    /**
     * Get all processes currently in the store. Useful for debugging.
     */
    async values(): Promise<
      Array<{ correlationId: string; data: ProcessData }>
    > {
      return Array.from(store.entries()).map(([correlationId, data]) => ({
        correlationId,
        data,
      }));
    },
  };
}

export type ProcessStore = ReturnType<typeof createProcessStore>;
