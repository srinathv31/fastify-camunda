import { runBackgroundCheckService } from '../src/camunda/processes/onboard-user/topics/run-background-check/service';
import { BusinessRuleError } from '../src/lib/errors';

// Mock the HTTP service so we can control the responses from our
// background check microservice. Without this mock, the real
// implementation would return an empty body or attempt a network
// request. Jest will automatically hoist this mock to the top of
// the module because it appears at the top level of the file.
jest.mock('../src/services/http.service', () => {
  return {
    http: {
      get: jest.fn(),
      post: jest.fn(),
    },
  };
});

describe('runBackgroundCheckService', () => {
  // Load the mocked http module after the jest.mock call above.
  const { http } = require('../src/services/http.service');
  const ctx = { app: {} } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws a BusinessRuleError when validated is false', async () => {
    const input = { userId: 'user1', validated: false };
    await expect(runBackgroundCheckService(input, ctx)).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('returns values from the HTTP response when validated', async () => {
    // Arrange a fake HTTP response
    (http.get as jest.Mock).mockResolvedValueOnce({ body: { passed: true, score: 88 } });
    const input = { userId: 'user2', validated: true };

    // Act
    const result = await runBackgroundCheckService(input, ctx);

    // Assert
    expect(result).toEqual({ backgroundCheckPassed: true, riskScore: 88 });
    expect(http.get).toHaveBeenCalledWith('/background-check', { searchParams: { userId: 'user2' } });
  });

  it('handles missing fields by generating defaults when validated', async () => {
    // When the body is empty the service will generate random values.
    // To make this deterministic, we override Math.random and Math.floor.
    const originalRandom = Math.random;
    const originalFloor = Math.floor;
    Math.random = () => 0.0; // ensures passed becomes true (0.0 > 0.2? no, but default passed uses random > 0.2; we invert below)
    Math.floor = (n: number) => 50; // riskScore becomes 50

    (http.get as jest.Mock).mockResolvedValueOnce({ body: {} });
    const result = await runBackgroundCheckService({ userId: 'user3', validated: true }, ctx);
    expect(result.backgroundCheckPassed).toBe(false); // because 0.0 > 0.2 is false
    expect(result.riskScore).toBe(50);

    // Restore originals
    Math.random = originalRandom;
    Math.floor = originalFloor;
  });

  it('propagates technical failures as generic errors', async () => {
    (http.get as jest.Mock).mockRejectedValueOnce(new Error('network error'));
    await expect(runBackgroundCheckService({ userId: 'user4', validated: true }, ctx)).rejects.toThrow('Failed to execute background check');
  });
});