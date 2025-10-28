# Testing Guide

This guide covers testing strategies, patterns, and best practices for fastify-camunda. You'll learn how to test services, handlers, and full processes.

## Testing Philosophy

Tests should be:

- **Fast**: Run in milliseconds, not seconds
- **Isolated**: No dependencies on external services or databases
- **Reliable**: Pass consistently without flakiness
- **Comprehensive**: Cover success paths, error paths, and edge cases

We use Jest as the test framework with mocked dependencies.

## Test Structure

### Directory Organization

```
test/
├── setupTests.ts                        # Jest setup and global mocks
├── validate-user-information.service.test.ts
├── run-background-check.service.test.ts
├── onboard-user.handlers.test.ts
├── waitroom.test.ts
├── process-store.test.ts
└── camunda.test.ts
```

### Test File Naming

- Service tests: `<step-name>.service.test.ts`
- Handler tests: `<process-name>.handlers.test.ts`
- Library tests: `<library-name>.test.ts`

## Running Tests

```bash
# Run all tests
pnpm test

# Run in watch mode (re-run on file changes)
pnpm test:watch

# Run with coverage report
pnpm test:cov

# Run specific test file
pnpm test -- waitroom.test.ts

# Run tests matching pattern
pnpm test -- --testNamePattern="timeout"
```

### Coverage Requirements

Maintain minimum 80% coverage across:

- Lines
- Statements
- Functions
- Branches

Check coverage report:

```bash
pnpm test:cov
open coverage/lcov-report/index.html
```

## Testing Services

Services contain business logic and should be thoroughly tested.

### Basic Service Test

```typescript
// test/validate-payment.service.test.ts
import { validatePaymentService } from "../src/camunda/processes/process-payment/topics/validate-payment/service";
import { BusinessRuleError } from "../src/lib/errors";

// Create mock Fastify app
const mockApp = {
  db: {
    query: jest.fn(),
  },
  log: {
    info: jest.fn(),
    error: jest.fn(),
  },
} as any;

describe("validatePaymentService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("successful validation", () => {
    it("validates a valid payment", async () => {
      // Setup mock responses
      mockApp.db.query
        .mockResolvedValueOnce({ recordset: [{ id: "cust-123" }] })
        .mockResolvedValueOnce({
          recordset: [{ id: "pm-456", is_valid: true }],
        });

      // Execute service
      const result = await validatePaymentService(
        {
          amount: 100.5,
          currency: "USD",
          customerId: "cust-123",
          paymentMethodId: "pm-456",
        },
        { app: mockApp }
      );

      // Assertions
      expect(result.isValid).toBe(true);
      expect(result.normalizedAmount).toBe(100.5);
      expect(mockApp.db.query).toHaveBeenCalledTimes(2);
    });
  });

  describe("validation failures", () => {
    it("rejects unsupported currency", async () => {
      await expect(
        validatePaymentService(
          {
            amount: 100,
            currency: "JPY",
            customerId: "cust-123",
            paymentMethodId: "pm-456",
          },
          { app: mockApp }
        )
      ).rejects.toThrow(BusinessRuleError);
    });

    it("rejects excessive amount", async () => {
      await expect(
        validatePaymentService(
          {
            amount: 15000,
            currency: "USD",
            customerId: "cust-123",
            paymentMethodId: "pm-456",
          },
          { app: mockApp }
        )
      ).rejects.toThrow("Payments over $10,000 require manual approval");
    });

    it("rejects non-existent customer", async () => {
      mockApp.db.query.mockResolvedValueOnce({ recordset: [] });

      await expect(
        validatePaymentService(
          {
            amount: 100,
            currency: "USD",
            customerId: "invalid",
            paymentMethodId: "pm-456",
          },
          { app: mockApp }
        )
      ).rejects.toThrow("Customer invalid not found");
    });
  });

  describe("edge cases", () => {
    it("handles database errors gracefully", async () => {
      mockApp.db.query.mockRejectedValueOnce(new Error("DB connection failed"));

      await expect(
        validatePaymentService(
          {
            amount: 100,
            currency: "USD",
            customerId: "cust-123",
            paymentMethodId: "pm-456",
          },
          { app: mockApp }
        )
      ).rejects.toThrow();
    });

    it("normalizes decimal amounts correctly", async () => {
      mockApp.db.query
        .mockResolvedValueOnce({ recordset: [{ id: "cust-123" }] })
        .mockResolvedValueOnce({
          recordset: [{ id: "pm-456", is_valid: true }],
        });

      const result = await validatePaymentService(
        {
          amount: 100.999,
          currency: "USD",
          customerId: "cust-123",
          paymentMethodId: "pm-456",
        },
        { app: mockApp }
      );

      expect(result.normalizedAmount).toBe(101.0);
    });
  });
});
```

### Service Test Pattern

1. **Setup**: Create mocks and test data
2. **Execute**: Call the service
3. **Assert**: Verify results and side effects
4. **Cleanup**: Clear mocks in `beforeEach`

### Testing Async Operations

```typescript
it("waits for external API response", async () => {
  const mockFetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ result: "success" }),
  });
  global.fetch = mockFetch as any;

  const result = await myService(input, { app: mockApp });

  expect(mockFetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/endpoint"),
    expect.objectContaining({ method: "POST" })
  );
  expect(result).toEqual({ result: "success" });
});
```

### Testing Error Handling

```typescript
describe("error handling", () => {
  it("throws BusinessRuleError for validation failures", async () => {
    const error = await validatePaymentService(invalidInput, {
      app: mockApp,
    }).catch((e) => e);

    expect(error).toBeInstanceOf(BusinessRuleError);
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.message).toContain("invalid");
  });

  it("propagates unexpected errors", async () => {
    mockApp.db.query.mockRejectedValue(new Error("DB failure"));

    await expect(myService(input, { app: mockApp })).rejects.toThrow(
      "DB failure"
    );
  });
});
```

## Testing Handlers

Handlers orchestrate service calls and Camunda task completion.

### Example Handler Test

```typescript
// test/onboard-user.handlers.test.ts
import { FastifyInstance } from "fastify";
import { Client } from "camunda-external-task-client-js";
import { registerValidateUserInformation } from "../src/camunda/processes/onboard-user/topics/validate-user-information/handler";

describe("onboard-user handlers", () => {
  let mockApp: FastifyInstance;
  let mockClient: any;
  let subscribedHandler: any;

  beforeEach(() => {
    // Mock Fastify app
    mockApp = {
      camundaClient: {
        subscribe: jest.fn((topic, handler) => {
          subscribedHandler = handler;
        }),
      },
      eventLog: {
        log: jest.fn(),
      },
      db: {
        query: jest.fn(),
      },
      log: {
        info: jest.fn(),
        error: jest.fn(),
      },
    } as any;

    // Register handler
    registerValidateUserInformation(mockApp);
  });

  it("subscribes to correct topic", () => {
    expect(mockApp.camundaClient.subscribe).toHaveBeenCalledWith(
      "onboard-user.validate-user-information",
      expect.any(Function)
    );
  });

  it("processes task successfully", async () => {
    const mockTask = {
      variables: {
        getAll: () => ({
          userId: { value: "user-123" },
          correlationId: { value: "corr-123" },
          batch_id: { value: "batch-123" },
          traceability_id: { value: "trace-123" },
          application_id: { value: "app-123" },
        }),
      },
      complete: jest.fn(),
      handleFailure: jest.fn(),
      handleBpmnError: jest.fn(),
    };

    mockApp.db.query.mockResolvedValue({ recordset: [{ id: "user-123" }] });

    await subscribedHandler({ task: mockTask, taskService: {} });

    expect(mockTask.complete).toHaveBeenCalled();
    expect(mockApp.eventLog.log).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "ok",
        step_name: "validate-user-information",
      })
    );
  });

  it("handles BusinessRuleError correctly", async () => {
    const mockTask = {
      variables: {
        getAll: () => ({
          userId: { value: "invalid-user" },
          correlationId: { value: "corr-123" },
          batch_id: { value: "batch-123" },
          traceability_id: { value: "trace-123" },
          application_id: { value: "app-123" },
        }),
      },
      complete: jest.fn(),
      handleBpmnError: jest.fn(),
    };

    mockApp.db.query.mockResolvedValue({ recordset: [] });

    await subscribedHandler({ task: mockTask, taskService: {} });

    expect(mockTask.handleBpmnError).toHaveBeenCalled();
    expect(mockApp.eventLog.log).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "error",
      })
    );
  });
});
```

## Testing Core Libraries

### Testing Waitroom

```typescript
// test/waitroom.test.ts
import {
  createWait,
  completeWait,
  failWait,
  clearAll,
} from "../src/lib/waitroom";

describe("waitroom", () => {
  afterEach(() => {
    clearAll();
  });

  describe("createWait", () => {
    it("resolves when completeWait is called", async () => {
      const correlationId = "test-123";
      const promise = createWait(correlationId, 5000);

      completeWait(correlationId, { result: "success" });

      await expect(promise).resolves.toEqual({ result: "success" });
    });

    it("rejects on timeout", async () => {
      const correlationId = "test-timeout";
      const promise = createWait(correlationId, 100);

      await expect(promise).rejects.toMatchObject({
        message: "Process timeout",
        code: "TIMEOUT",
      });
    });

    it("rejects when failWait is called", async () => {
      const correlationId = "test-fail";
      const promise = createWait(correlationId, 5000);

      failWait(correlationId, new Error("Process failed"));

      await expect(promise).rejects.toThrow("Process failed");
    });
  });

  describe("completeWait", () => {
    it("returns true when wait exists", () => {
      const correlationId = "test-123";
      createWait(correlationId, 5000);

      const result = completeWait(correlationId, { data: "test" });

      expect(result).toBe(true);
    });

    it("returns false when wait does not exist", () => {
      const result = completeWait("non-existent", { data: "test" });

      expect(result).toBe(false);
    });
  });

  describe("clearAll", () => {
    it("rejects all pending waits", async () => {
      const promises = [
        createWait("test-1", 5000),
        createWait("test-2", 5000),
        createWait("test-3", 5000),
      ];

      clearAll("testing");

      await Promise.all(
        promises.map((p) => expect(p).rejects.toThrow("Aborted: testing"))
      );
    });
  });
});
```

### Testing Process Store

```typescript
// test/process-store.test.ts
import { createProcessStore } from "../src/lib/process-store";

describe("process-store", () => {
  let store: ReturnType<typeof createProcessStore>;

  beforeEach(() => {
    const mockRepo = {
      upsertProcessStore: jest.fn(),
      findProcessStore: jest.fn(),
      findAllProcessStore: jest.fn(),
    };
    store = createProcessStore(mockRepo);
  });

  describe("save", () => {
    it("stores data in memory", async () => {
      await store.save("corr-123", {
        status: "ok",
        data: { result: "success" },
      });

      const retrieved = await store.get("corr-123");
      expect(retrieved?.status).toBe("ok");
      expect(retrieved?.data).toEqual({ result: "success" });
    });

    it("persists to database asynchronously", async () => {
      await store.save("corr-123", { status: "pending" });

      // Database write is fire-and-forget, so we can't directly assert
      // In practice, you'd test the repository separately
    });
  });

  describe("get", () => {
    it("returns data from memory if available", async () => {
      await store.save("corr-123", { status: "ok" });

      const data = await store.get("corr-123");

      expect(data).toBeDefined();
      expect(data?.status).toBe("ok");
    });

    it("returns null if not found", async () => {
      const data = await store.get("non-existent");

      expect(data).toBeNull();
    });
  });

  describe("remove", () => {
    it("removes from memory", async () => {
      await store.save("corr-123", { status: "ok" });
      await store.remove("corr-123");

      const data = await store.get("corr-123");

      expect(data).toBeNull();
    });
  });
});
```

## Integration Testing

For end-to-end tests, use Fastify's test utilities:

```typescript
import { build } from "../src/server";

describe("API Integration", () => {
  let app: Awaited<ReturnType<typeof build>>;

  beforeAll(async () => {
    app = await build();
  });

  afterAll(async () => {
    await app.close();
  });

  it("starts a process and returns status", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/process/start",
      payload: {
        processKey: "onboard-user",
        correlationId: "test-integration-123",
        variables: { userId: "user-123" },
      },
    });

    expect(response.statusCode).toBeOneOf([200, 202]);
    expect(response.json()).toHaveProperty("correlationId");
  });
});
```

## Mocking Strategies

### Global Mocks

Setup in `test/setupTests.ts`:

```typescript
// Mock Camunda client
jest.mock("camunda-external-task-client-js", () => ({
  Client: jest.fn().mockImplementation(() => ({
    subscribe: jest.fn(),
    start: jest.fn(),
  })),
}));

// Mock MSSQL
jest.mock("mssql", () => ({
  ConnectionPool: jest.fn().mockImplementation(() => ({
    connect: jest.fn().resolves(),
    query: jest.fn(),
    close: jest.fn(),
  })),
}));
```

### Local Mocks

For specific tests:

```typescript
jest.mock("../src/services/http.service", () => ({
  httpService: jest.fn().mockResolvedValue({ status: "ok" }),
}));
```

### Spy on Real Implementations

```typescript
import * as waitroom from "../src/lib/waitroom";

it("calls completeWait when process finishes", async () => {
  const spy = jest.spyOn(waitroom, "completeWait");

  await completeProcess("corr-123", { result: "success" });

  expect(spy).toHaveBeenCalledWith("corr-123", { result: "success" });
  spy.mockRestore();
});
```

## Best Practices

### Do's

- ✅ Test one thing per test
- ✅ Use descriptive test names
- ✅ Clear mocks between tests
- ✅ Test both success and error paths
- ✅ Test edge cases and boundary conditions
- ✅ Use `beforeEach` for common setup
- ✅ Assert on specific values, not just truthy/falsy
- ✅ Mock external dependencies

### Don'ts

- ❌ Don't test implementation details
- ❌ Don't share state between tests
- ❌ Don't use real databases or APIs
- ❌ Don't write tests that depend on test order
- ❌ Don't ignore flaky tests
- ❌ Don't skip tests without good reason

### Test Organization

```typescript
describe('ComponentName', () => {
  describe('methodName', () => {
    describe('when condition', () => {
      it('does something specific', () => {
        // Arrange
        const input = { ... };

        // Act
        const result = method(input);

        // Assert
        expect(result).toBe(expected);
      });
    });
  });
});
```

## Debugging Tests

### Run Single Test

```bash
pnpm test -- -t "validates a valid payment"
```

### Enable Verbose Output

```bash
pnpm test -- --verbose
```

### Debug in VS Code

Add to `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Jest Debug",
  "program": "${workspaceFolder}/node_modules/.bin/jest",
  "args": ["--runInBand", "--no-cache"],
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen"
}
```

Set breakpoints and run "Jest Debug" configuration.

## Coverage Reports

View coverage:

```bash
pnpm test:cov
open coverage/lcov-report/index.html
```

Identify uncovered code:

- Red: Not covered
- Yellow: Partially covered (some branches)
- Green: Fully covered

Focus on testing:

1. Critical business logic
2. Error handling paths
3. Edge cases
4. Complex conditionals

## Continuous Integration

Ensure tests pass before merging:

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: "18"
      - run: pnpm install
      - run: pnpm test:cov
      - name: Upload coverage
        uses: codecov/codecov-action@v2
```

## Next Steps

- **[Creating a Process](creating-a-process.md)**: Apply testing to new processes
- **[Contributing Guide](../../CONTRIBUTING.md)**: Contribution requirements
- **[Error Handling](../reference/error-handling.md)**: Test error scenarios
