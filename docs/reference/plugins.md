# Plugins Reference

Fastify plugins extend the application with shared functionality. This document details all plugins used in fastify-camunda.

## Plugin Registration Order

Plugins are registered in `src/server.ts` in this order:

1. **env**: Environment variable parsing and validation
2. **logger**: Structured logging with Pino
3. **db**: Database connection pool
4. **eventLog**: Event logging decorator
5. **processStore**: Process state management
6. **camundaClient**: Camunda external task client

Order matters: plugins can depend on previously registered plugins.

## env Plugin

**File**: `src/plugins/env.ts`

Parses and validates environment variables using Zod schemas. Makes configuration available on `app.config`.

### Usage

```typescript
const port = app.config.PORT;
const camundaUrl = app.config.CAMUNDA_BASE_URL;
```

### Configuration Schema

```typescript
{
  NODE_ENV: "development" | "test" | "production",  // Default: "development"
  PORT: number,                                      // Optional
  CAMUNDA_BASE_URL: string (URL),                    // Default: http://localhost:8080/engine-rest
  CAMUNDA_MAX_TASKS: number,                         // Default: 10
  CAMUNDA_LOCK_DURATION_MS: number,                  // Default: 20000
  CAMUNDA_ASYNC_RESPONSE_TIMEOUT_MS: number,         // Default: 30000
  SYNC_TIMEOUT_MS: number,                           // Default: 25000
  DB_HOST: string,                                   // Optional
  DB_NAME: string,                                   // Optional
  DB_USER: string,                                   // Optional
  DB_PASSWORD: string,                               // Optional
}
```

### Type Declaration

```typescript
declare module "fastify" {
  interface FastifyInstance {
    config: {
      NODE_ENV: "development" | "test" | "production";
      PORT?: number;
      CAMUNDA_BASE_URL: string;
      CAMUNDA_MAX_TASKS: number;
      CAMUNDA_LOCK_DURATION_MS: number;
      CAMUNDA_ASYNC_RESPONSE_TIMEOUT_MS: number;
      SYNC_TIMEOUT_MS: number;
      DB_HOST?: string;
      DB_NAME?: string;
      DB_USER?: string;
      DB_PASSWORD?: string;
    };
  }
}
```

### Error Handling

If environment validation fails:

- Error is logged with detailed validation issues
- `ENV_VALIDATION_FAILED` error is thrown
- Application exits

### Best Practices

- Set all required variables in `.env` file
- Use defaults for local development
- Override in production environment
- Never commit `.env` files

---

## logger Plugin

**File**: `src/plugins/logger.ts`

Configures structured JSON logging using Pino. Replaces default Fastify logger with a custom instance.

### Features

- **Structured logs**: JSON format for easy parsing
- **Redaction**: Automatically removes sensitive data (passwords, tokens, auth headers)
- **Environment-aware**: Pretty printing in development, JSON in production
- **Log levels**: Configurable via `LOG_LEVEL` environment variable

### Usage

```typescript
app.log.info("Process started", { correlationId: "user-123" });
app.log.error({ err }, "Process failed");
app.log.debug("Debugging information", { data });
```

### Log Levels

- **fatal** (60): Application crash
- **error** (50): Errors requiring attention
- **warn** (40): Warnings
- **info** (30): General information (default in production)
- **debug** (20): Detailed debugging (default in development)
- **trace** (10): Very detailed tracing

### Configuration

Set log level via environment:

```bash
LOG_LEVEL=debug pnpm run dev
```

### Redaction

These fields are automatically removed:

- `req.headers.authorization`
- Any field named `password`
- Any field named `token`

Example:

```typescript
app.log.info("User login", {
  userId: "user-123",
  password: "secret", // Redacted
});
// Output: { "userId": "user-123" }
```

### Development Mode

Pretty-printed output:

```
[10:30:15.123] INFO: Process started
    correlationId: "user-123"
    processInstanceId: "abc-123"
```

### Production Mode

JSON output:

```json
{
  "level": 30,
  "time": 1698432015123,
  "pid": 12345,
  "hostname": "worker-01",
  "msg": "Process started",
  "correlationId": "user-123",
  "processInstanceId": "abc-123"
}
```

### Best Practices

- Use structured data: `app.log.info('message', { data })`
- Include correlation IDs in logs
- Use appropriate log levels
- Don't log sensitive data (it will be redacted but better to avoid)

---

## db Plugin

**File**: `src/plugins/db.ts`

Creates and manages a MSSQL connection pool. Decorates `app.db` with query methods.

### Usage

```typescript
const result = await app.db.query("SELECT * FROM users WHERE id = @userId", [
  userId,
]);

const user = result.recordset[0];
```

### Configuration

Configured in `src/server.ts`:

```typescript
await app.register(db, {
  config: {
    user: process.env.DB_USER!,
    password: process.env.DB_PASS!,
    server: process.env.DB_HOST!,
    database: process.env.DB_NAME!,
    options: {
      encrypt: false,
      trustServerCertificate: false,
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  },
});
```

### Connection Pool

Pool settings:

- **max**: Maximum connections (default: 10)
- **min**: Minimum connections (default: 0)
- **idleTimeoutMillis**: Close idle connections after (default: 30000)

### Type Declaration

```typescript
declare module "fastify" {
  interface FastifyInstance {
    db: {
      query<T = any>(
        sql: string,
        params?: any[]
      ): Promise<{
        recordset: T[];
        rowsAffected: number[];
      }>;
    };
  }
}
```

### Query Methods

**Simple query**:

```typescript
const result = await app.db.query("SELECT * FROM users");
```

**Parameterized query** (recommended):

```typescript
const result = await app.db.query("SELECT * FROM users WHERE id = @userId", [
  userId,
]);
```

**Insert**:

```typescript
await app.db.query(
  "INSERT INTO event_log (correlation_id, step_name, status) VALUES (@cid, @step, @status)",
  [correlationId, stepName, "ok"]
);
```

### Error Handling

```typescript
try {
  const result = await app.db.query("SELECT * FROM users");
} catch (err) {
  app.log.error({ err }, "Database query failed");
  throw err;
}
```

### Lifecycle

- **Startup**: Connection pool is created and tested
- **Runtime**: Connections are reused from pool
- **Shutdown**: Pool is closed gracefully via `onClose` hook

### Best Practices

- Always use parameterized queries to prevent SQL injection
- Handle errors appropriately
- Don't hold connections open unnecessarily
- Monitor connection pool usage

---

## eventLog Plugin

**File**: `src/plugins/event-log.ts`

Provides event logging functionality for recording process steps. Decorates `app.eventLog`.

### Usage

```typescript
await app.eventLog.log({
  correlation_id: "user-123",
  step_name: "validate-user-information",
  status: "ok",
  http_method: null,
  endpoint: null,
  request_data: { userId: "user-123" },
  response_data: { valid: true },
  error_message: null,
});
```

### Type Declaration

```typescript
declare module "fastify" {
  interface FastifyInstance {
    eventLog: {
      log(event: EventLogEntry): Promise<void>;
    };
  }
}

interface EventLogEntry {
  correlation_id: string;
  step_name: string;
  status: "ok" | "error";
  http_method: string | null;
  endpoint: string | null;
  request_data: any;
  response_data?: any;
  error_message?: string | null;
}
```

### Database Schema

Events are stored in `event_log` table:

```sql
CREATE TABLE event_log (
  id INT IDENTITY(1,1) PRIMARY KEY,
  correlation_id VARCHAR(255) NOT NULL,
  step_name VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL,
  http_method VARCHAR(10),
  endpoint VARCHAR(500),
  request_data NVARCHAR(MAX),
  response_data NVARCHAR(MAX),
  error_message NVARCHAR(MAX),
  created_at DATETIME2 DEFAULT GETDATE(),
  INDEX idx_correlation_id (correlation_id)
);
```

### Automatic Usage

The `subscribeTopic` helper automatically logs events for each step:

```typescript
subscribeTopic<InVars, OutVars>(app, {
  topic: "onboard-user.validate-user-information",
  stepConfig,
  processDefaults,
  inSchema: InVars,
  service: validateUserInformationService,
  resultMessage: (out) => "user validated",
});
```

This logs:

- Step start
- Step completion (ok/error)
- Input and output data
- Any errors

### Querying Event Logs

```typescript
// Get all events for a process
const events = await app.db.query(
  "SELECT * FROM event_log WHERE correlation_id = @cid ORDER BY created_at",
  [correlationId]
);

// Get failed steps
const failures = await app.db.query(
  "SELECT * FROM event_log WHERE status = 'error' ORDER BY created_at DESC"
);
```

### Best Practices

- Log every significant step
- Include relevant data (but not sensitive information)
- Use consistent step names
- Query logs for debugging and auditing

---

## processStore Plugin

**File**: `src/plugins/process-store.ts`

Manages process state with in-memory Map and async database persistence. Decorates `app.processStore`.

### Usage

```typescript
// Save process state
await app.processStore.save("user-123", {
  status: "pending",
  data: { step: "validate-user-information" },
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

// Get process state
const state = await app.processStore.get("user-123");

// Remove process
await app.processStore.remove("user-123");

// Get all processes
const all = await app.processStore.values();
```

### Type Declaration

```typescript
declare module "fastify" {
  interface FastifyInstance {
    processStore: {
      save(correlationId: string, data: ProcessStoreData): Promise<void>;
      get(correlationId: string): Promise<ProcessStoreData | null>;
      remove(correlationId: string): Promise<void>;
      values(): Promise<Array<ProcessStoreData & { correlationId: string }>>;
    };
  }
}

interface ProcessStoreData {
  status: "pending" | "ok" | "error";
  data?: any;
  error?: string;
  startedAt?: string;
  updatedAt?: string;
}
```

### In-Memory + Database

Process store uses dual storage:

1. **In-memory Map**: Immediate read/write, cleared on restart
2. **Database**: Persistent storage, async writes

**save()** behavior:

- Updates Map immediately (synchronous)
- Writes to DB async (fire-and-forget)
- Errors in DB write are logged but don't fail the operation

**get()** behavior:

- Reads from Map if available
- Falls back to database if not in Map
- Returns `null` if not found

### Cleanup

Completed processes are removed from Map after 5 seconds:

```typescript
setTimeout(() => {
  app.processStore.remove(correlationId);
}, 5000);
```

Database records persist indefinitely.

### Lifecycle

- **Startup**: Creates empty Map
- **Runtime**: Tracks active processes
- **Shutdown**: Clears waitroom via `onClose` hook

### Best Practices

- Use for active process tracking
- Query database for historical data
- Don't store large data payloads
- Clean up completed processes

---

## camundaClient Plugin

**File**: `src/plugins/camunda-client.ts`

Creates and configures a Camunda external task client. Decorates `app.camundaClient`.

### Usage

```typescript
app.camundaClient.subscribe("my-topic", async ({ task, taskService }) => {
  // Handle task
  const variables = task.variables.getAll();

  // Complete task
  await task.complete({ result: "success" });
});
```

### Type Declaration

```typescript
declare module "fastify" {
  interface FastifyInstance {
    camundaClient: Client;
  }
}
```

### Configuration

Configured via environment variables:

```typescript
const client = new Client({
  baseUrl: CAMUNDA_BASE_URL,
  asyncResponseTimeout: CAMUNDA_ASYNC_RESPONSE_TIMEOUT_MS,
  maxTasks: CAMUNDA_MAX_TASKS,
  lockDuration: CAMUNDA_LOCK_DURATION_MS,
  use: CamundaLogger,
});
```

### Client Options

- **baseUrl**: Camunda REST API endpoint
- **asyncResponseTimeout**: Long polling timeout (default: 30000ms)
- **maxTasks**: Max tasks to fetch per poll (default: 10)
- **lockDuration**: How long to lock tasks (default: 20000ms)
- **use**: Logger middleware

### Topic Subscription

Subscribe to topics via helper:

```typescript
import { subscribeTopic } from "./lib/subscribe-topic";

subscribeTopic<InVars, OutVars>(app, {
  topic: "process-payment.validate-payment",
  stepConfig: STEP_CONFIG,
  processDefaults: PROCESS_DEFAULTS,
  inSchema: InVarsSchema,
  service: validatePaymentService,
  resultMessage: (out) => `validated: ${out.isValid}`,
});
```

See [Core Libraries](core-libraries.md#subscribe-topic) for details.

### Lifecycle

- **Startup**: Client is created but not started
- **Runtime**: Polls for tasks, executes handlers
- **Shutdown**: Stops polling via `onClose` hook

### Error Handling

The client library handles:

- Connection failures (retries)
- Task lock expiration
- Handler errors (can trigger Camunda retry)

### Best Practices

- Don't create multiple clients (use single app.camundaClient)
- Set appropriate lock duration for your tasks
- Handle errors in task handlers
- Use `subscribeTopic` helper for consistency

---

## Adding New Plugins

To add a new plugin:

1. Create plugin file in `src/plugins/`
2. Use `fastify-plugin` wrapper
3. Register in `src/server.ts`
4. Add type declarations if decorating
5. Document in this file

Example:

```typescript
// src/plugins/my-plugin.ts
import fp from "fastify-plugin";

declare module "fastify" {
  interface FastifyInstance {
    myService: {
      doSomething(): Promise<void>;
    };
  }
}

export default fp(async (app) => {
  const myService = {
    async doSomething() {
      app.log.info("Doing something");
    },
  };

  app.decorate("myService", myService);
});
```

Register:

```typescript
// src/server.ts
import myPlugin from "./plugins/my-plugin";

await app.register(myPlugin);
```

## Related Documentation

- [Configuration Reference](configuration.md): Environment variables
- [Core Libraries](core-libraries.md): Helper libraries
- [Architecture Overview](../design/architecture-overview.md): System design
