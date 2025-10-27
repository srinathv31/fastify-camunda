import { callOnboardingApiService } from "../src/camunda/processes/onboard-user/topics/call-onboarding-api/service";
import { BusinessRuleError } from "../src/lib/errors";

// Mock the HTTP service to control responses from the onboarding API.
jest.mock("../src/services/http.service", () => {
  return {
    http: {
      get: jest.fn(),
      post: jest.fn(),
    },
  };
});

describe("callOnboardingApiService", () => {
  const { http } = require("../src/services/http.service");
  const ctx = { app: {} } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("throws a BusinessRuleError when validated is false", async () => {
    const input = {
      userId: "user1",
      validated: false,
      backgroundCheckPassed: true,
      riskScore: 10,
    };
    await expect(callOnboardingApiService(input, ctx)).rejects.toBeInstanceOf(
      BusinessRuleError
    );
  });

  it("returns negative onboarding result when background check failed", async () => {
    const input = {
      userId: "user2",
      validated: true,
      backgroundCheckPassed: false,
      riskScore: 20,
    };
    const result = await callOnboardingApiService(input, ctx);
    expect(result).toEqual({
      onboarded: false,
      reason: "Background check failed",
    });
    // http.post should not be called because the background check failed
    expect(http.post).not.toHaveBeenCalled();
  });

  it("honours API response when onboarding succeeds", async () => {
    (http.post as jest.Mock).mockResolvedValueOnce({
      body: { onboarded: true },
      statusCode: 200,
    });
    const input = {
      userId: "user3",
      validated: true,
      backgroundCheckPassed: true,
      riskScore: 50,
    };
    const result = await callOnboardingApiService(input, ctx);
    expect(result).toEqual({
      data: { onboarded: true, reason: undefined, customerId: undefined },
      http_status_code: 200,
    });
    expect(http.post).toHaveBeenCalledWith("/onboarding", {
      json: { userId: "user3", riskScore: 50 },
    });
  });

  it("honours API response when onboarding fails with reason", async () => {
    (http.post as jest.Mock).mockResolvedValueOnce({
      body: { onboarded: false, reason: "manual review required" },
      statusCode: 200,
    });
    const input = {
      userId: "user4",
      validated: true,
      backgroundCheckPassed: true,
      riskScore: 30,
    };
    const result = await callOnboardingApiService(input, ctx);
    expect(result).toEqual({
      data: {
        onboarded: false,
        reason: "manual review required",
        customerId: undefined,
      },
      http_status_code: 200,
    });
  });

  it("derives onboarding outcome based on risk score when API does not specify", async () => {
    (http.post as jest.Mock).mockResolvedValueOnce({
      body: {},
      statusCode: 200,
    });
    // Low risk score < 75 should yield success
    let result = await callOnboardingApiService(
      {
        userId: "user5",
        validated: true,
        backgroundCheckPassed: true,
        riskScore: 10,
      },
      ctx
    );
    expect(result).toEqual({
      data: { onboarded: true, reason: undefined, customerId: undefined },
      http_status_code: 200,
    });
    // High risk score >= 75 should fail
    (http.post as jest.Mock).mockResolvedValueOnce({
      body: {},
      statusCode: 200,
    });
    result = await callOnboardingApiService(
      {
        userId: "user6",
        validated: true,
        backgroundCheckPassed: true,
        riskScore: 90,
      },
      ctx
    );
    expect(result).toEqual({
      data: {
        onboarded: false,
        reason: "Risk score too high to onboard",
        customerId: undefined,
      },
      http_status_code: 200,
    });
  });

  it("propagates technical failures as generic errors", async () => {
    (http.post as jest.Mock).mockRejectedValueOnce(
      new Error("service unavailable")
    );
    await expect(
      callOnboardingApiService(
        {
          userId: "user7",
          validated: true,
          backgroundCheckPassed: true,
          riskScore: 40,
        },
        ctx
      )
    ).rejects.toThrow("Failed to call onboarding API");
  });
});
