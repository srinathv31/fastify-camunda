import { handleErrorService } from "../src/camunda/processes/onboard-user/topics/handle-error/service";

// Mock fetch globally
global.fetch = jest.fn();

describe("handleErrorService", () => {
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

  it("calls complete endpoint with error status and returns errorHandled:true on success", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    const input = {
      correlationId: "test-corr-1",
      errorCode: "EMPLOYEE_CARD_ERROR",
      errorMessage: "Validation failed",
      errorType: "VALIDATION_ERROR",
    };

    const result = await handleErrorService(input, { app: mockApp });

    expect(result).toEqual({ errorHandled: true });
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/process/complete",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          correlationId: "test-corr-1",
          status: "error",
          error: "Validation failed",
        }),
      }
    );
    expect(mockApp.log.info).toHaveBeenCalledWith(
      { correlationId: "test-corr-1" },
      "error handler completed successfully"
    );
  });

  it("uses default error message when errorMessage is not provided", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    const input = {
      correlationId: "test-corr-2",
      errorCode: "EMPLOYEE_CARD_ERROR",
      errorMessage: undefined,
      errorType: "TECHNICAL_ERROR",
    };

    await handleErrorService(input, { app: mockApp });

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.error).toBe("Process failed");
  });

  it("logs error and returns errorHandled:false when complete endpoint fails", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const input = {
      correlationId: "test-corr-3",
      errorCode: "EMPLOYEE_CARD_ERROR",
      errorMessage: "Technical error occurred",
      errorType: "TECHNICAL_ERROR",
    };

    const result = await handleErrorService(input, { app: mockApp });

    expect(result).toEqual({ errorHandled: false });
    expect(mockApp.log.error).toHaveBeenCalledWith(
      { correlationId: "test-corr-3", statusCode: 500 },
      "failed to call complete endpoint from error handler"
    );
  });

  it("handles fetch errors and returns errorHandled:false", async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(
      new Error("network error")
    );

    const input = {
      correlationId: "test-corr-4",
      errorCode: "EMPLOYEE_CARD_ERROR",
      errorMessage: "Business rule violation",
      errorType: "BUSINESS_RULE_ERROR",
    };

    const result = await handleErrorService(input, { app: mockApp });

    expect(result).toEqual({ errorHandled: false });
    expect(mockApp.log.error).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: "test-corr-4",
      }),
      "error handler failed to notify client"
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
      correlationId: "test-corr-5",
      errorCode: "EMPLOYEE_CARD_ERROR",
      errorMessage: "Error occurred",
      errorType: "UNKNOWN",
    };

    await handleErrorService(input, { app: appWithoutPort });

    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8080/api/process/complete",
      expect.any(Object)
    );
  });

  it("logs input parameters on entry", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    const input = {
      correlationId: "test-corr-6",
      errorCode: "EMPLOYEE_CARD_ERROR",
      errorMessage: "Test error message",
      errorType: "TEST_ERROR",
    };

    await handleErrorService(input, { app: mockApp });

    expect(mockApp.log.info).toHaveBeenCalledWith(
      {
        correlationId: "test-corr-6",
        errorCode: "EMPLOYEE_CARD_ERROR",
        errorType: "TEST_ERROR",
        errorMessage: "Test error message",
      },
      "handling process error"
    );
  });
});
