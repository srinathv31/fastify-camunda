/**
 * Process store provides database-backed persistence for tracking active processes.
 * This replaces the in-memory Map approach with MSSQL queries for multi-instance
 * support and durability across restarts.
 */

import {
  upsertProcessStore,
  findProcessStore,
  findAllProcessStore,
  deleteProcessStore,
} from "../repositories/process-store.repo";
import { Db } from "../repositories/process-store.repo";

export interface ProcessData {
  status: "pending" | "ok" | "error";
  data?: any;
  error?: string;
  startedAt?: string;
  updatedAt?: string;
}

/**
 * Create a new process store instance backed by the database.
 * The store provides methods for saving, retrieving and removing processes.
 */
export function createProcessStore(db: Db) {
  return {
    /**
     * Save or update a process in the database. Performs an upsert operation.
     */
    async save(
      correlationId: string,
      data: Partial<ProcessData>
    ): Promise<void> {
      // Fetch existing data if updating
      const existing = await findProcessStore(db, correlationId);
      const now = new Date().toISOString();

      const updated: ProcessData = {
        status: data.status ?? existing?.status ?? "pending",
        data: data.data ?? existing?.data,
        error: data.error ?? existing?.error,
        startedAt: data.startedAt ?? existing?.startedAt ?? now,
        updatedAt: data.updatedAt ?? now,
      };

      await upsertProcessStore(db, correlationId, updated);
    },

    /**
     * Get a process from the database by correlation ID.
     */
    async get(correlationId: string): Promise<ProcessData | undefined> {
      const result = await findProcessStore(db, correlationId);
      return result ?? undefined;
    },

    /**
     * Remove a process from the database. Typically called when
     * a process completes to clean up storage.
     */
    async remove(correlationId: string): Promise<void> {
      await deleteProcessStore(db, correlationId);
    },

    /**
     * Get all processes currently in the database. Useful for debugging.
     */
    async values(): Promise<
      Array<{ correlationId: string; data: ProcessData }>
    > {
      return await findAllProcessStore(db);
    },
  };
}

export type ProcessStore = ReturnType<typeof createProcessStore>;
