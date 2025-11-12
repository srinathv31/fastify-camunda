import {
  createWait,
  completeWait,
  failWait,
  clearAll,
  hasPendingWait,
  getPendingCount,
} from "../src/lib/waitroom";
import { Db } from "../src/repositories/process-store.repo";

describe("waitroom (MSSQL-backed)", () => {
  let mockDb: Db;
  let dbStore: Map<string, any>;

  beforeEach(() => {
    // Create an in-memory mock database for testing
    dbStore = new Map();

    mockDb = {
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        // Mock SET LOCK_TIMEOUT
        if (sql.includes("SET LOCK_TIMEOUT")) {
          return [];
        }

        // Mock SELECT (poll)
        if (sql.includes("SELECT") && sql.includes("correlation_id")) {
          const correlationId = params?.[0];
          const row = dbStore.get(correlationId);
          return row ? [row] : [];
        }

        // Mock UPDATE (complete/fail)
        if (sql.includes("UPDATE")) {
          const correlationId = params?.[0];
          const existing = dbStore.get(correlationId) || {};

          if (sql.includes("status = 'DONE'")) {
            dbStore.set(correlationId, {
              ...existing,
              status: "DONE",
              payload_json: params?.[1],
              error_json: null,
              updated_at: new Date(),
            });
          } else if (sql.includes("status = 'ERROR'")) {
            dbStore.set(correlationId, {
              ...existing,
              status: "ERROR",
              error_json: params?.[1],
              payload_json: null,
              updated_at: new Date(),
            });
          }
          return [];
        }

        // Mock COUNT (getPendingCount)
        if (sql.includes("COUNT")) {
          let count = 0;
          dbStore.forEach((row) => {
            if (row.status === "PENDING") count++;
          });
          return [{ count }];
        }

        // Mock bulk UPDATE (clearAll)
        if (sql.includes("WHERE status = 'PENDING'")) {
          dbStore.forEach((row, key) => {
            if (row.status === "PENDING") {
              dbStore.set(key, {
                ...row,
                status: "ERROR",
                error_json: params?.[0],
              });
            }
          });
          return [];
        }

        return [];
      }),
    };
  });

  afterEach(() => {
    dbStore.clear();
  });

  describe("createWait", () => {
    it("polls database and resolves when status becomes DONE", async () => {
      const correlationId = "test-corr-1";

      // Initialize as PENDING
      dbStore.set(correlationId, {
        status: "PENDING",
        payload_json: null,
        error_json: null,
        started_at: new Date(),
        updated_at: new Date(),
      });

      // Simulate completion after 100ms
      setTimeout(() => {
        dbStore.set(correlationId, {
          status: "DONE",
          payload_json: JSON.stringify({ result: "success" }),
          error_json: null,
          started_at: new Date(),
          updated_at: new Date(),
        });
      }, 100);

      const result = await createWait(mockDb, correlationId, 5000);
      expect(result).toEqual({ result: "success" });
    });

    it("times out if process doesn't complete within timeout", async () => {
      const correlationId = "test-corr-2";

      // Initialize as PENDING and never complete
      dbStore.set(correlationId, {
        status: "PENDING",
        payload_json: null,
        error_json: null,
        started_at: new Date(),
        updated_at: new Date(),
      });

      await expect(
        createWait(mockDb, correlationId, 100)
      ).rejects.toMatchObject({
        message: "Process timeout",
        code: "TIMEOUT",
      });
    });

    it("rejects when status becomes ERROR", async () => {
      const correlationId = "test-corr-3";

      // Initialize as PENDING
      dbStore.set(correlationId, {
        status: "PENDING",
        payload_json: null,
        error_json: null,
        started_at: new Date(),
        updated_at: new Date(),
      });

      // Simulate failure after 100ms
      setTimeout(() => {
        dbStore.set(correlationId, {
          status: "ERROR",
          payload_json: null,
          error_json: JSON.stringify({ message: "process failed" }),
          started_at: new Date(),
          updated_at: new Date(),
        });
      }, 100);

      await expect(createWait(mockDb, correlationId, 5000)).rejects.toThrow(
        "process failed"
      );
    });
  });

  describe("completeWait", () => {
    it("updates database to DONE status", async () => {
      const correlationId = "test-corr-4";

      // Initialize as PENDING
      dbStore.set(correlationId, {
        status: "PENDING",
        payload_json: null,
        error_json: null,
      });

      const result = await completeWait(mockDb, correlationId, {
        data: "test",
      });
      expect(result).toBe(true);

      const row = dbStore.get(correlationId);
      expect(row.status).toBe("DONE");
      expect(row.payload_json).toBe(JSON.stringify({ data: "test" }));
    });

    it("returns true even for non-existent correlation ID", async () => {
      // In the new implementation, completeWait always returns true
      // because it performs an UPDATE (which succeeds even if 0 rows affected)
      const result = await completeWait(mockDb, "non-existent-id", {
        data: "test",
      });
      expect(result).toBe(true);
    });
  });

  describe("failWait", () => {
    it("updates database to ERROR status", async () => {
      const correlationId = "test-corr-5";

      // Initialize as PENDING
      dbStore.set(correlationId, {
        status: "PENDING",
        payload_json: null,
        error_json: null,
      });

      const result = await failWait(
        mockDb,
        correlationId,
        new Error("test error")
      );
      expect(result).toBe(true);

      const row = dbStore.get(correlationId);
      expect(row.status).toBe("ERROR");
      expect(JSON.parse(row.error_json).message).toBe("test error");
    });

    it("returns true even for non-existent correlation ID", async () => {
      const result = await failWait(
        mockDb,
        "non-existent-id",
        new Error("test error")
      );
      expect(result).toBe(true);
    });
  });

  describe("hasPendingWait", () => {
    it("returns true for PENDING processes", async () => {
      const correlationId = "test-corr-6";
      dbStore.set(correlationId, { status: "PENDING" });

      const result = await hasPendingWait(mockDb, correlationId);
      expect(result).toBe(true);
    });

    it("returns false for DONE processes", async () => {
      const correlationId = "test-corr-7";
      dbStore.set(correlationId, { status: "DONE" });

      const result = await hasPendingWait(mockDb, correlationId);
      expect(result).toBe(false);
    });

    it("returns false for non-existent processes", async () => {
      const result = await hasPendingWait(mockDb, "non-existent-id");
      expect(result).toBe(false);
    });
  });

  describe("getPendingCount", () => {
    it("returns count of PENDING processes", async () => {
      dbStore.set("corr-1", { status: "PENDING" });
      dbStore.set("corr-2", { status: "PENDING" });
      dbStore.set("corr-3", { status: "DONE" });

      const count = await getPendingCount(mockDb);
      expect(count).toBe(2);
    });

    it("returns 0 when no PENDING processes", async () => {
      dbStore.set("corr-1", { status: "DONE" });
      dbStore.set("corr-2", { status: "ERROR" });

      const count = await getPendingCount(mockDb);
      expect(count).toBe(0);
    });
  });

  describe("clearAll", () => {
    it("updates all PENDING processes to ERROR", async () => {
      dbStore.set("corr-1", { status: "PENDING" });
      dbStore.set("corr-2", { status: "PENDING" });
      dbStore.set("corr-3", { status: "DONE" });

      await clearAll(mockDb, "server shutdown");

      expect(dbStore.get("corr-1").status).toBe("ERROR");
      expect(dbStore.get("corr-2").status).toBe("ERROR");
      expect(dbStore.get("corr-3").status).toBe("DONE"); // Should not change
    });

    it("uses default reason if none provided", async () => {
      dbStore.set("corr-1", { status: "PENDING" });

      await clearAll(mockDb);

      const row = dbStore.get("corr-1");
      expect(row.status).toBe("ERROR");
      expect(row.error_json).toContain("shutdown");
    });
  });
});
