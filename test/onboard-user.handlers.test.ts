import { build } from "../src/server";

// Mock mssql to prevent actual database connections during tests
jest.mock("mssql");

// Mock the HTTP service so handlers that call external APIs use predictable responses.
jest.mock("../src/services/http.service", () => {
  return {
    http: {
      get: jest.fn(),
      post: jest.fn(),
    },
  };
});

describe("onboard-user handlers (validate, background check, onboarding)", () => {
  const { http } = require("../src/services/http.service");

  // Helper to construct a fake Camunda task with variables and businessKey.
  function makeTask(vars: Record<string, any>, businessKey = "corr-123") {
    return {
      businessKey,
      variables: {
        getAll() {
          return vars;
        },
      },
    };
  }

  // Helper to construct a fake taskService with spies.
  function makeTaskService() {
    return {
      complete: jest.fn().mockResolvedValue(undefined),
      handleBpmnError: jest.fn().mockResolvedValue(undefined),
      handleFailure: jest.fn().mockResolvedValue(undefined),
    };
  }

  let app: any;
  let client: any;

  beforeAll(async () => {
    // Ensure deterministic environment variables for plugin defaults.
    process.env.NODE_ENV = "test";
    app = await build();
    // Access the mocked Camunda client from the app. The mock exposes
    // a __trigger() method to simulate external task events.
    client = app.camundaClient;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("completes validate-user-information on success", async () => {
    const eventSpy = jest.spyOn(app, "eventLog").mockResolvedValue(undefined);
    const task = makeTask({
      userId: "Alice",
      application_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    });
    const taskService = makeTaskService();
    await client.__trigger("onboard-user.validate-user-information", {
      task,
      taskService,
    });
    // The handler should complete the task with validated variables.
    expect(taskService.complete).toHaveBeenCalledTimes(1);
    const outVars = (taskService.complete.mock.calls[0][1] as any).getAll();
    expect(outVars).toEqual({
      validated: true,
      normalizedUserId: "alice",
      identifiers: { applicationId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" },
    });
    // No BPMN error or technical failure should be reported.
    expect(taskService.handleBpmnError).not.toHaveBeenCalled();
    expect(taskService.handleFailure).not.toHaveBeenCalled();
    // Event log should record success.
    expect(eventSpy).toHaveBeenCalledWith(
      expect.objectContaining({ result: "User information validated" })
    );
  });

  it("reports BPMN error when validate-user-information fails", async () => {
    const eventSpy = jest.spyOn(app, "eventLog").mockResolvedValue(undefined);
    const task = makeTask({
      userId: "invalid_user",
      application_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    });
    const taskService = makeTaskService();
    await client.__trigger("onboard-user.validate-user-information", {
      task,
      taskService,
    });
    // The handler should not complete the task, but handle a BPMN error.
    expect(taskService.complete).not.toHaveBeenCalled();
    expect(taskService.handleBpmnError).toHaveBeenCalledTimes(1);
    expect(taskService.handleFailure).not.toHaveBeenCalled();
    // Event log should record a BPMN error.
    expect(eventSpy).toHaveBeenCalledWith(
      expect.objectContaining({ result: "User information validation failed" })
    );
  });

  it("runs background check and completes on success", async () => {
    const eventSpy = jest.spyOn(app, "eventLog").mockResolvedValue(undefined);
    // Arrange: HTTP service returns a passing background check with a fixed score.
    (http.get as jest.Mock).mockResolvedValueOnce({
      body: { passed: true, score: 42 },
    });
    const task = makeTask({
      userId: "userB",
      validated: true,
      application_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    });
    const taskService = makeTaskService();
    await client.__trigger("onboard-user.run-background-check", {
      task,
      taskService,
    });
    expect(taskService.complete).toHaveBeenCalledTimes(1);
    const outVars = (taskService.complete.mock.calls[0][1] as any).getAll();
    expect(outVars).toEqual({
      backgroundCheckPassed: true,
      riskScore: 42,
      identifiers: { applicationId: "cccccccc-cccc-cccc-cccc-cccccccccccc" },
    });
    expect(eventSpy).toHaveBeenCalledWith(
      expect.objectContaining({ result: "Background check completed" })
    );
  });

  it("reports BPMN error when background check is attempted without validation", async () => {
    const eventSpy = jest.spyOn(app, "eventLog").mockResolvedValue(undefined);
    const task = makeTask({
      userId: "userC",
      validated: false,
      application_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
    });
    const taskService = makeTaskService();
    await client.__trigger("onboard-user.run-background-check", {
      task,
      taskService,
    });
    expect(taskService.handleBpmnError).toHaveBeenCalledTimes(1);
    expect(taskService.complete).not.toHaveBeenCalled();
    expect(taskService.handleFailure).not.toHaveBeenCalled();
    expect(eventSpy).toHaveBeenCalledWith(
      expect.objectContaining({ result: "Background check failed" })
    );
  });

  it("handles technical failure during background check", async () => {
    const eventSpy = jest.spyOn(app, "eventLog").mockResolvedValue(undefined);
    (http.get as jest.Mock).mockRejectedValueOnce(new Error("service error"));
    const task = makeTask({
      userId: "userD",
      validated: true,
      application_id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
    });
    const taskService = makeTaskService();
    await client.__trigger("onboard-user.run-background-check", {
      task,
      taskService,
    });
    // Technical failures are handled as BPMN errors in the implementation
    expect(taskService.handleBpmnError).toHaveBeenCalledTimes(1);
    expect(taskService.complete).not.toHaveBeenCalled();
    expect(taskService.handleFailure).not.toHaveBeenCalled();
    expect(eventSpy).toHaveBeenCalledWith(
      expect.objectContaining({ result: "Background check failed" })
    );
  });

  it("completes onboarding when previous steps succeed", async () => {
    const eventSpy = jest.spyOn(app, "eventLog").mockResolvedValue(undefined);
    // HTTP returns success for onboarding API.
    (http.post as jest.Mock).mockResolvedValueOnce({
      body: { onboarded: true },
    });
    const task = makeTask({
      userId: "userE",
      validated: true,
      backgroundCheckPassed: true,
      riskScore: 10,
      application_id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
    });
    const taskService = makeTaskService();
    await client.__trigger("onboard-user.call-onboarding-api", {
      task,
      taskService,
    });
    expect(taskService.complete).toHaveBeenCalledTimes(1);
    const outVars = (taskService.complete.mock.calls[0][1] as any).getAll();
    expect(outVars).toEqual(
      expect.objectContaining({
        onboarded: true,
        identifiers: { applicationId: "ffffffff-ffff-ffff-ffff-ffffffffffff" },
      })
    );
    expect(outVars.reason).toBeUndefined(); // reason is filtered out when undefined
    expect(eventSpy).toHaveBeenCalledWith(
      expect.objectContaining({ result: "Onboarding API call successful" })
    );
  });

  it("returns onboarding negative result without calling API when background check failed", async () => {
    const eventSpy = jest.spyOn(app, "eventLog").mockResolvedValue(undefined);
    const task = makeTask({
      userId: "userF",
      validated: true,
      backgroundCheckPassed: false,
      riskScore: 90,
      application_id: "99999999-9999-9999-9999-999999999999",
    });
    const taskService = makeTaskService();
    await client.__trigger("onboard-user.call-onboarding-api", {
      task,
      taskService,
    });
    expect(taskService.complete).toHaveBeenCalledTimes(1);
    const outVars = (taskService.complete.mock.calls[0][1] as any).getAll();
    expect(outVars).toEqual({
      onboarded: false,
      reason: "Background check failed",
      identifiers: { applicationId: "99999999-9999-9999-9999-999999999999" },
    });
    expect(http.post).not.toHaveBeenCalled();
    expect(eventSpy).toHaveBeenCalledWith(
      expect.objectContaining({ result: "Onboarding API call successful" })
    );
  });

  it("reports BPMN error when onboarding is attempted without validation", async () => {
    const eventSpy = jest.spyOn(app, "eventLog").mockResolvedValue(undefined);
    const task = makeTask({
      userId: "userG",
      validated: false,
      backgroundCheckPassed: true,
      riskScore: 50,
      application_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    });
    const taskService = makeTaskService();
    await client.__trigger("onboard-user.call-onboarding-api", {
      task,
      taskService,
    });
    expect(taskService.handleBpmnError).toHaveBeenCalledTimes(1);
    expect(taskService.complete).not.toHaveBeenCalled();
    expect(taskService.handleFailure).not.toHaveBeenCalled();
    expect(eventSpy).toHaveBeenCalledWith(
      expect.objectContaining({ result: "Onboarding API call failed" })
    );
  });

  it("handles technical failure during onboarding API call", async () => {
    const eventSpy = jest.spyOn(app, "eventLog").mockResolvedValue(undefined);
    (http.post as jest.Mock).mockRejectedValueOnce(
      new Error("downstream unavailable")
    );
    const task = makeTask({
      userId: "userH",
      validated: true,
      backgroundCheckPassed: true,
      riskScore: 20,
      application_id: "11111111-2222-3333-4444-555555555555",
    });
    const taskService = makeTaskService();
    await client.__trigger("onboard-user.call-onboarding-api", {
      task,
      taskService,
    });
    // Technical failures are handled as BPMN errors in the implementation
    expect(taskService.handleBpmnError).toHaveBeenCalledTimes(1);
    expect(taskService.complete).not.toHaveBeenCalled();
    expect(taskService.handleFailure).not.toHaveBeenCalled();
    expect(eventSpy).toHaveBeenCalledWith(
      expect.objectContaining({ result: "Onboarding API call failed" })
    );
  });
});
