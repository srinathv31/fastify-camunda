import {
  createWait,
  completeWait,
  failWait,
  clearAll,
} from "../src/lib/waitroom";

describe("waitroom", () => {
  beforeEach(() => {
    // Clear any pending waits before each test
    clearAll("test-cleanup");
  });

  afterEach(() => {
    // Clear any pending waits after each test to prevent leaks
    clearAll("test-cleanup");
  });

  describe("createWait", () => {
    it("creates a promise that can be resolved with completeWait", async () => {
      const correlationId = "test-corr-1";
      const promise = createWait(correlationId, 5000);

      // Complete the wait from another context
      setTimeout(() => {
        completeWait(correlationId, { result: "success" });
      }, 10);

      const result = await promise;
      expect(result).toEqual({ result: "success" });
    });

    it("creates a promise that times out if not completed", async () => {
      const correlationId = "test-corr-2";
      const promise = createWait(correlationId, 50);

      await expect(promise).rejects.toMatchObject({
        message: "Process timeout",
        code: "TIMEOUT",
      });
    });

    it("creates a promise that can be rejected with failWait", async () => {
      const correlationId = "test-corr-3";
      const promise = createWait(correlationId, 5000);

      // Fail the wait from another context
      setTimeout(() => {
        failWait(correlationId, new Error("process failed"));
      }, 10);

      await expect(promise).rejects.toThrow("process failed");
    });
  });

  describe("completeWait", () => {
    it("returns true when completing an existing wait", async () => {
      const correlationId = "test-corr-4";
      const promise = createWait(correlationId, 5000);

      const result = completeWait(correlationId, { data: "test" });
      expect(result).toBe(true);

      // Verify the promise resolves with the correct data
      await expect(promise).resolves.toEqual({ data: "test" });
    });

    it("returns false when trying to complete a non-existent wait", () => {
      const result = completeWait("non-existent-id", { data: "test" });
      expect(result).toBe(false);
    });
  });

  describe("failWait", () => {
    it("returns true when failing an existing wait", async () => {
      const correlationId = "test-corr-5";
      const promise = createWait(correlationId, 5000);

      const result = failWait(correlationId, new Error("test error"));
      expect(result).toBe(true);

      // Consume the rejected promise to avoid unhandled rejection
      await expect(promise).rejects.toThrow("test error");
    });

    it("returns false when trying to fail a non-existent wait", () => {
      const result = failWait("non-existent-id", new Error("test error"));
      expect(result).toBe(false);
    });
  });

  describe("clearAll", () => {
    it("rejects all pending waits with abort message", async () => {
      const correlationId1 = "test-corr-6";
      const correlationId2 = "test-corr-7";

      const promise1 = createWait(correlationId1, 5000);
      const promise2 = createWait(correlationId2, 5000);

      clearAll("server shutdown");

      await expect(promise1).rejects.toThrow("Aborted: server shutdown");
      await expect(promise2).rejects.toThrow("Aborted: server shutdown");
    });

    it("uses default reason if none provided", async () => {
      const correlationId = "test-corr-8";
      const promise = createWait(correlationId, 5000);

      clearAll();

      await expect(promise).rejects.toThrow("Aborted: shutdown");
    });

    it("clears all pending waits so subsequent completeWait returns false", async () => {
      const correlationId = "test-corr-9";
      const promise = createWait(correlationId, 5000);

      clearAll();

      // Consume the rejected promise
      await expect(promise).rejects.toThrow("Aborted: shutdown");

      const result = completeWait(correlationId, { data: "test" });
      expect(result).toBe(false);
    });
  });
});
