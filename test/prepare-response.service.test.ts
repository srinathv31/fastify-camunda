import { prepareResponseService } from "../src/camunda/processes/onboard-user/topics/prepare-response/service";

// Mock fetch globally
global.fetch = jest.fn();

describe("prepareResponseService", () => {
  const mockApp = {
    config: { PORT: 3000 },
    log: {
      info: jest.fn(),
      error: jest.fn(),
    },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls complete endpoint with success status when onboarding succeeds", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    const input = {
      correlationId: "test-corr-1",
      userId: "user1",
      validated: true,
      backgroundCheckPassed: true,
      onboarded: true,
      riskScore: 10,
      reason: undefined,
    };

    const result = await prepareResponseService(input, { app: mockApp });

    expect(result).toEqual({ completed: true });
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/process/complete",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          correlationId: "test-corr-1",
          status: "ok",
          data: {
            userId: "user1",
            validated: true,
            backgroundCheckPassed: true,
            onboarded: true,
            riskScore: 10,
            reason: undefined,
            success: true,
          },
          error: undefined,
        }),
      }
    );
    expect(mockApp.log.info).toHaveBeenCalledWith(
      { correlationId: "test-corr-1" },
      "process completion callback sent"
    );
  });

  it("calls complete endpoint with error status when onboarding fails", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    const input = {
      correlationId: "test-corr-2",
      userId: "user2",
      validated: true,
      backgroundCheckPassed: false,
      onboarded: false,
      riskScore: 85,
      reason: "Background check failed",
    };

    const result = await prepareResponseService(input, { app: mockApp });

    expect(result).toEqual({ completed: true });
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/process/complete",
      expect.objectContaining({
        body: JSON.stringify({
          correlationId: "test-corr-2",
          status: "error",
          data: undefined,
          error: "Background check failed",
        }),
      })
    );
  });

  it("uses default error message when reason is not provided", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    const input = {
      correlationId: "test-corr-3",
      userId: "user3",
      validated: false,
      backgroundCheckPassed: false,
      onboarded: false,
      riskScore: 90,
      reason: undefined,
    };

    await prepareResponseService(input, { app: mockApp });

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.error).toBe("Onboarding process failed");
  });

  it("logs error when complete endpoint returns non-ok status", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const input = {
      correlationId: "test-corr-4",
      userId: "user4",
      validated: true,
      backgroundCheckPassed: true,
      onboarded: true,
      riskScore: 10,
      reason: undefined,
    };

    const result = await prepareResponseService(input, { app: mockApp });

    expect(result).toEqual({ completed: true });
    expect(mockApp.log.error).toHaveBeenCalledWith(
      { correlationId: "test-corr-4", statusCode: 500 },
      "failed to call process/complete endpoint"
    );
  });

  it("handles fetch errors gracefully and returns completed:true", async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(
      new Error("network error")
    );

    const input = {
      correlationId: "test-corr-5",
      userId: "user5",
      validated: true,
      backgroundCheckPassed: true,
      onboarded: true,
      riskScore: 10,
      reason: undefined,
    };

    const result = await prepareResponseService(input, { app: mockApp });

    expect(result).toEqual({ completed: true });
    expect(mockApp.log.error).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: "test-corr-5",
      }),
      "failed to send completion callback"
    );
  });

  it("uses default port 8080 when config PORT is not set", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    const appWithoutPort = {
      config: {},
      log: {
        info: jest.fn(),
        error: jest.fn(),
      },
    } as any;

    const input = {
      correlationId: "test-corr-6",
      userId: "user6",
      validated: true,
      backgroundCheckPassed: true,
      onboarded: true,
      riskScore: 10,
      reason: undefined,
    };

    await prepareResponseService(input, { app: appWithoutPort });

    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8080/api/process/complete",
      expect.any(Object)
    );
  });
});
