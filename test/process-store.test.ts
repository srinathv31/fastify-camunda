import { createProcessStore, ProcessData } from "../src/lib/process-store";

describe("process-store", () => {
  describe("createProcessStore without DB", () => {
    it("saves and retrieves a process", async () => {
      const store = createProcessStore();
      const correlationId = "test-corr-1";

      await store.save(correlationId, {
        status: "pending",
        data: { userId: "user1" },
      });

      const result = await store.get(correlationId);
      expect(result).toMatchObject({
        status: "pending",
        data: { userId: "user1" },
      });
      expect(result?.startedAt).toBeDefined();
      expect(result?.updatedAt).toBeDefined();
    });

    it("updates an existing process", async () => {
      const store = createProcessStore();
      const correlationId = "test-corr-2";

      await store.save(correlationId, {
        status: "pending",
        data: { userId: "user2" },
      });

      const first = await store.get(correlationId);

      // Small delay to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      await store.save(correlationId, {
        status: "ok",
        data: { userId: "user2", completed: true },
      });

      const second = await store.get(correlationId);
      expect(second?.status).toBe("ok");
      expect(second?.data).toEqual({ userId: "user2", completed: true });
      expect(second?.startedAt).toBe(first?.startedAt);
      expect(second?.updatedAt).not.toBe(first?.updatedAt);
    });

    it("removes a process from the store", async () => {
      const store = createProcessStore();
      const correlationId = "test-corr-3";

      await store.save(correlationId, { status: "pending" });
      expect(await store.get(correlationId)).toBeDefined();

      await store.remove(correlationId);
      expect(await store.get(correlationId)).toBeUndefined();
    });

    it("returns all processes with values()", async () => {
      const store = createProcessStore();

      await store.save("corr-1", { status: "pending" });
      await store.save("corr-2", { status: "ok" });

      const all = await store.values();
      expect(all).toHaveLength(2);
      expect(all.find((p) => p.correlationId === "corr-1")).toBeDefined();
      expect(all.find((p) => p.correlationId === "corr-2")).toBeDefined();
    });

    it("returns undefined for non-existent process", async () => {
      const store = createProcessStore();
      const result = await store.get("non-existent");
      expect(result).toBeUndefined();
    });

    it("preserves existing fields when updating with partial data", async () => {
      const store = createProcessStore();
      const correlationId = "test-corr-4";

      await store.save(correlationId, {
        status: "pending",
        data: { userId: "user4" },
        error: undefined,
      });

      await store.save(correlationId, {
        status: "error",
        error: "something went wrong",
      });

      const result = await store.get(correlationId);
      expect(result?.status).toBe("error");
      expect(result?.data).toEqual({ userId: "user4" }); // Preserved
      expect(result?.error).toBe("something went wrong");
    });
  });

  describe("createProcessStore with DB", () => {
    it("calls dbWrite callback on save", async () => {
      const dbWrite = jest.fn().mockResolvedValue(undefined);
      const store = createProcessStore(dbWrite);
      const correlationId = "test-corr-5";

      await store.save(correlationId, {
        status: "pending",
        data: { userId: "user5" },
      });

      // Wait for async dbWrite to be called
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(dbWrite).toHaveBeenCalledTimes(1);
      expect(dbWrite).toHaveBeenCalledWith(
        correlationId,
        expect.objectContaining({
          status: "pending",
          data: { userId: "user5" },
        })
      );
    });

    it("continues normally when dbWrite fails", async () => {
      const dbWrite = jest.fn().mockRejectedValue(new Error("database error"));
      const store = createProcessStore(dbWrite);
      const correlationId = "test-corr-6";

      await store.save(correlationId, { status: "pending" });

      // Wait for async dbWrite to be called and fail
      await new Promise((resolve) => setTimeout(resolve, 10));

      // The save should still succeed in memory
      const result = await store.get(correlationId);
      expect(result).toBeDefined();
      expect(result?.status).toBe("pending");
      expect(dbWrite).toHaveBeenCalled();
    });
  });
});
