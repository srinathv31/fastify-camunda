# Core Libraries Reference

Core libraries provide essential functionality for process management, Camunda integration, and error handling. These libraries are in `src/lib/`.

## waitroom.ts

**Purpose**: Manages pending process requests waiting for completion using promises and timeouts.

### Overview

The waitroom enables the sync/async pattern by tracking promises for processes. When a client starts a process, a promise is created and waits for completion or timeout. When the process completes, the promise resolves and the client receives the result.

### Type Definitions

```typescript
type Pending = {
  resolve: (v: any) => void;
  reject: (e: any) => void;
  timeout: NodeJS.Timeout;
};
```

### Functions

#### createWait

Create a wait for a process identified by correlationId.

```typescript
function createWait(correlationId: string, ms: number): Promise<any>;
```

**Parameters**:

- `correlationId`: Unique identifier for the process
- `ms`: Timeout in milliseconds

**Returns**: Promise that resolves with process result or rejects on timeout/error

**Example**:

```typescript
const promise = createWait("user-123", 25000);
// Promise will resolve when completeWait is called
// or reject after 25 seconds
```

**Timeout Behavior**:

- After `ms` milliseconds, rejects with `{ message: "Process timeout", code: "TIMEOUT" }`
- Automatically removes promise from pending map

#### completeWait

Complete a pending wait with a successful result.

```typescript
function completeWait(correlationId: string, payload: any): boolean;
```

**Parameters**:

- `correlationId`: The process identifier
- `payload`: The result data to return to waiting client

**Returns**: `true` if pending wait found and completed, `false` otherwise

**Example**:

```typescript
const woke = completeWait("user-123", { success: true, userId: "user-123" });
// woke === true if client was waiting
// woke === false if no one was waiting (timed out or never created)
```

#### failWait

Fail a pending wait with an error.

```typescript
function failWait(correlationId: string, err: any): boolean;
```

**Parameters**:

- `correlationId`: The process identifier
- `err`: The error to reject with

**Returns**: `true` if pending wait found and failed, `false` otherwise

**Example**:

```typescript
failWait("user-123", new Error("Process failed"));
```

#### clearAll

Clear all pending waits. Called on server shutdown.

```typescript
function clearAll(reason: string = "shutdown"): void;
```

**Parameters**:

- `reason`: Optional reason for the abort (default: "shutdown")

**Example**:

```typescript
clearAll("server restarting");
// All pending promises reject with: "Aborted: server restarting"
```

### Usage Pattern

```typescript
// 1. Start endpoint creates wait
const result = await createWait(correlationId, 25000);

// 2a. If process completes quickly, completeWait is called
completeWait(correlationId, { result: "success" });
// Promise resolves, client gets 200

// 2b. If timeout expires first
// Promise rejects with TIMEOUT error, client gets 202
```

### Memory Management

- Pending promises stored in Map
- Automatically removed on completion, failure, or timeout
- Cleared on server shutdown
- No limit on concurrent promises (scales with available memory)

---

## process-store.ts

**Purpose**: In-memory Map for immediate process status access with async database persistence.

### Overview

The process store maintains process state in memory for fast access while asynchronously persisting to the database for durability. This provides the best of both worlds: speed and reliability.

### Type Definitions

```typescript
interface ProcessStoreData {
  status: "pending" | "ok" | "error";
  data?: any;
  error?: string;
  startedAt?: string;
  updatedAt?: string;
}
```

### Functions

#### createProcessStore

Factory function that creates a process store instance.

```typescript
function createProcessStore(repository: ProcessStoreRepository): ProcessStore;
```

**Parameters**:

- `repository`: Database repository with `upsertProcessStore`, `findProcessStore`, `findAllProcessStore` methods

**Returns**: Process store instance with `save`, `get`, `remove`, `values` methods

### Process Store Interface

#### save

Save or update process state.

```typescript
async save(correlationId: string, data: Partial<ProcessStoreData>): Promise<void>
```

**Parameters**:

- `correlationId`: Unique process identifier
- `data`: Process state data (partial updates supported)

**Behavior**:

1. Updates in-memory Map immediately (synchronous)
2. Merges with existing data if present
3. Sets `updatedAt` automatically
4. Persists to database async (fire-and-forget)

**Example**:

```typescript
await processStore.save("user-123", {
  status: "pending",
  data: { step: "validate-user-information" },
  startedAt: new Date().toISOString(),
});

// Later, update status
await processStore.save("user-123", {
  status: "ok",
  data: { success: true },
});
```

#### get

Retrieve process state by correlation ID.

```typescript
async get(correlationId: string): Promise<ProcessStoreData | null>
```

**Parameters**:

- `correlationId`: Unique process identifier

**Returns**: Process state data or `null` if not found

**Behavior**:

1. Checks in-memory Map first
2. Falls back to database if not in memory
3. Returns `null` if not found anywhere

**Example**:

```typescript
const state = await processStore.get("user-123");
if (state) {
  console.log(`Status: ${state.status}`);
}
```

#### remove

Remove process from in-memory Map.

```typescript
async remove(correlationId: string): Promise<void>
```

**Parameters**:

- `correlationId`: Unique process identifier

**Behavior**:

- Removes from in-memory Map only
- Database record persists for historical audit
- Safe to call even if not in Map

**Example**:

```typescript
// Remove from memory after completion
setTimeout(() => {
  processStore.remove("user-123");
}, 5000);
```

#### values

Get all processes from in-memory Map.

```typescript
async values(): Promise<Array<ProcessStoreData & { correlationId: string }>>
```

**Returns**: Array of all in-memory process states

**Example**:

```typescript
const allProcesses = await processStore.values();
console.log(`Active processes: ${allProcesses.length}`);
```

### Design Rationale

**Why in-memory Map?**

- Instant access (< 1ms vs 5-10ms for database)
- No database load for status polling
- Critical for sync/async pattern responsiveness

**Why async database writes?**

- Don't block response on database writes
- Database provides durability and recovery
- Fire-and-forget pattern for performance

**Trade-offs**:

- Memory grows with concurrent processes
- In-memory data lost on restart (database has history)
- Future: Can be replaced with Redis for distributed systems

---

## camunda.ts

**Purpose**: Helper functions for reading variables, completing tasks, and handling errors in Camunda.

### Functions

#### readVars

Convert Camunda task variables into a plain JavaScript object.

```typescript
function readVars(task: Task): Record<string, unknown>;
```

**Parameters**:

- `task`: Camunda task instance

**Returns**: Plain object with all process variables

**Example**:

```typescript
const vars = readVars(task);
// { userId: 'user-123', email: 'user@example.com', ... }
```

#### completeWith

Complete a Camunda task with output variables.

```typescript
async function completeWith(
  taskService: TaskService,
  task: Task,
  out: Record<string, unknown>
): Promise<void>;
```

**Parameters**:

- `taskService`: Camunda task service
- `task`: Task instance
- `out`: Output variables to set on process

**Example**:

```typescript
await completeWith(taskService, task, {
  validated: true,
  normalizedUserId: "user-123",
});
```

#### handleBpmnErrorWith

Handle a BPMN error with variables.

```typescript
async function handleBpmnErrorWith(
  taskService: TaskService,
  task: Task,
  errorCode: string,
  errorMessage: string,
  vars?: Record<string, unknown>
): Promise<void>;
```

**Parameters**:

- `taskService`: Camunda task service
- `task`: Task instance
- `errorCode`: BPMN error code
- `errorMessage`: Error message
- `vars`: Optional error variables

**Example**:

```typescript
await handleBpmnErrorWith(
  taskService,
  task,
  "VALIDATION_FAILED",
  "User validation failed",
  { userId: "user-123", reason: "invalid email" }
);
```

#### toBpmnError

Convert any error to a BPMN error structure.

```typescript
function toBpmnError(err: unknown): {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};
```

**Parameters**:

- `err`: Any error (BusinessRuleError, ZodError, Error, etc.)

**Returns**: Structured BPMN error

**Behavior**:

- `BusinessRuleError`: Uses error code and details
- `ZodError`: Maps to validation error
- Other errors: Maps to technical error
- All errors use `EMPLOYEE_CARD_ERROR` code for BPMN routing

**Example**:

```typescript
try {
  // business logic
} catch (err) {
  const bpmnError = toBpmnError(err);
  // { code: 'EMPLOYEE_CARD_ERROR', message: '...', details: {...} }
}
```

---

## subscribe-topic.ts

**Purpose**: Generic wrapper for subscribing to Camunda topics with automatic error handling, event logging, and variable management.

### Overview

`subscribeTopic` is the primary way to register Camunda task handlers. It handles all common tasks: variable parsing, service invocation, task completion, error handling, and event logging. This eliminates boilerplate in individual handlers.

### Type Definitions

```typescript
type ServiceOutput<O> = O | { data: O; http_status_code?: number };
```

Service can return either:

1. Direct output: `{ field1: value1, field2: value2 }`
2. With HTTP status override: `{ data: {...}, http_status_code: 201 }`

### Function Signature

```typescript
function subscribeTopic<I, O>(
  app: FastifyInstance,
  cfg: {
    topic: string;
    stepConfig: CompiledStep;
    processDefaults: {
      target_system: string;
      originating_system: string;
      process_name: string;
    };
    inSchema: z.ZodType<I>;
    service: (
      input: I,
      ctx: { app: FastifyInstance }
    ) => Promise<ServiceOutput<O>>;
    resultMessage?: (out: O) => string;
  }
): void;
```

### Parameters

- **topic**: Camunda topic name (e.g., `"onboard-user.validate-user-information"`)
- **stepConfig**: Step metadata from process definition
- **processDefaults**: Process-level constants
- **inSchema**: Zod schema for input validation
- **service**: Business logic function
- **resultMessage**: Optional function to generate human-readable result message

### Usage Example

```typescript
subscribeTopic<InVars, OutVars>(app, {
  topic: "process-payment.validate-payment",
  stepConfig: PROCESS_PAYMENT_STEPS["validate-payment"],
  processDefaults: PROCESS_DEFAULTS,
  inSchema: InVars,
  service: validatePaymentService,
  resultMessage: (out) => (out.isValid ? "valid" : "invalid"),
});
```

### Behavior Flow

1. **Fetch Task**: Polls Camunda for tasks with the topic
2. **Extract Variables**: Reads all process variables
3. **Extract Context**: Gets batch_id, traceability_id, application_id
4. **Validate Input**: Parses variables with Zod schema
5. **Invoke Service**: Calls business logic with validated input
6. **Extract Output**: Handles both direct and wrapped output patterns
7. **Update Identifiers**: Propagates common fields (userId, customerId, etc.)
8. **Complete Task**: Sets output variables on process
9. **Log Event**: Records success in event_log table

If error occurs:

1. **Convert to BPMN Error**: Uses `toBpmnError()`
2. **Propagate Error**: Calls `handleBpmnErrorWith()`
3. **Map HTTP Status**: Validation=422, Technical=500, Business=400
4. **Log Event**: Records error in event_log table

### Automatic Features

**Input Validation**:

- Zod schema validates all input variables
- Validation errors automatically converted to BPMN errors

**Output Filtering**:

- Removes `undefined` values from output
- Prevents polluting process variables

**Identifier Propagation**:

- Automatically carries forward: customerId, userId, orderId, accountId
- Merged into `identifiers` object
- Available to all subsequent steps

**Event Logging**:

- Automatic logging with full context
- Request/response data
- Execution time tracking
- HTTP status codes
- Error details

**Error Handling**:

- All errors converted to BPMN errors
- Error types mapped to HTTP status codes
- Detailed error logging
- Process continues to error handler

### Service Implementation Pattern

```typescript
export async function myService(
  input: InVars,
  ctx: { app: FastifyInstance }
): Promise<OutVars> {
  // Access dependencies via ctx.app
  const result = await ctx.app.db.query("SELECT ...", [input.id]);

  // Business logic
  if (!result.recordset.length) {
    throw new BusinessRuleError("NOT_FOUND", "Resource not found");
  }

  // Return output
  return {
    success: true,
    data: result.recordset[0],
  };
}
```

---

## errors.ts

**Purpose**: Custom error types for business rule violations.

### BusinessRuleError

Signals that a process-specific business rule was violated.

```typescript
class BusinessRuleError extends Error {
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>);
}
```

### Usage

```typescript
import { BusinessRuleError } from "../lib/errors";

if (!isValidEmail(email)) {
  throw new BusinessRuleError("INVALID_EMAIL", "Email format is invalid", {
    email,
    providedFormat: "invalid",
  });
}
```

### Error Handling

When thrown from a service:

1. `subscribeTopic` catches it
2. Converted to BPMN error via `toBpmnError()`
3. Propagated to Camunda with code and details
4. Logged to event_log
5. Process routes to error handler (if defined in BPMN)

### HTTP Status Mapping

- `BusinessRuleError`: 400 Bad Request
- `ZodError` (validation): 422 Unprocessable Entity
- Other errors: 500 Internal Server Error

### Best Practices

- Use `BusinessRuleError` for expected business rule violations
- Include detailed context in `details` object
- Use descriptive error codes (SCREAMING_SNAKE_CASE)
- Let unexpected errors propagate naturally

---

## define-process.ts

**Purpose**: Type-safe process definition builder.

### Overview

Provides a fluent API for defining processes with step metadata. Ensures type safety and consistency across process definitions.

### Usage

```typescript
export const MY_PROCESS = defineProcess([
  "step-one",
  "step-two",
  "step-three",
] as const)({
  "step-one": {
    http_method: "POST",
    endpoint: "/api/endpoint",
    success: { result: "Step one completed" },
    error: { result: "Step one failed" },
  },
  // ... other steps
});

export const MY_PROCESS_STEPS = MY_PROCESS.compiled;
export type MyProcessStepName = (typeof MY_PROCESS.stepsInOrder)[number];
```

### Benefits

- Type-safe step names
- Consistent step metadata
- Compile-time validation
- Auto-completion in IDEs
- Centralized process configuration

---

## util.ts

**Purpose**: Utility functions for common tasks.

### Functions

Typically includes helpers for:

- String formatting
- Date manipulation
- Data transformation
- Retry logic
- Common validations

Check `src/lib/util.ts` for available utilities.

---

## Best Practices

### Using waitroom

- Always pair `createWait` with eventual `completeWait` or `failWait`
- Set appropriate timeout (25s default is good for most cases)
- Don't create multiple waits for same correlationId

### Using process-store

- Save immediately on process start
- Update at significant milestones
- Remove from memory after completion (5s delay)
- Query database for historical data

### Using subscribeTopic

- Always use this wrapper instead of direct `app.camundaClient.subscribe`
- Keep services pure and testable
- Use `BusinessRuleError` for business failures
- Return clean output objects
- Let the wrapper handle event logging

### Error Handling

- Use `BusinessRuleError` for business rule violations
- Let technical errors propagate naturally
- Include context in error details
- Map errors to appropriate HTTP status codes

## Related Documentation

- [Plugins Reference](plugins.md): Fastify plugins
- [Services Reference](services.md): Reusable services
- [Error Handling](error-handling.md): Comprehensive error patterns
- [Creating a Process](../guides/creating-a-process.md): Practical usage
