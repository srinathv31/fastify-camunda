# Callback Strategy Implementation

This document describes the callback strategy implementation that integrates the pattern from `fastify-api-framework` into the `fastify-camunda` application.

## Overview

The callback strategy enables a sync/async pattern for Camunda processes:

- External clients can start processes and wait up to a timeout (default 25s)
- If the process completes within the timeout, they get an immediate response (200)
- If the timeout expires, they get a 202 with a status URL for polling
- The in-memory Map provides fast access, with async database persistence for durability

## Architecture Components

### Core Libraries

**`src/lib/waitroom.ts`**

- Manages pending promises for processes waiting for completion
- `createWait(correlationId, timeoutMs)` - creates a waiting promise
- `completeWait(correlationId, payload)` - resolves promise with success
- `failWait(correlationId, error)` - rejects promise with error
- `clearAll()` - cleanup on shutdown

**`src/lib/process-store.ts`**

- In-memory Map for immediate process status access
- Simple interface: `save()`, `get()`, `remove()`, `values()`
- Fire-and-forget database writes after Map updates

### Plugin & Repository

**`src/plugins/process-store.ts`**

- Fastify plugin that decorates `app.processStore`
- Integrates in-memory Map with async DB persistence
- Clears waitroom on server shutdown

**`src/repositories/process-store.repo.ts`**

- Database operations for process store persistence
- `upsertProcessStore()` - async DB write
- `findProcessStore()` - query single process
- `findAllProcessStore()` - query all processes

### REST API Routes

Routes are auto-loaded from `src/routes/process/` with prefix `/api/process`:

**`POST /api/process/start`**

- Start a new process with `{ processKey, correlationId, variables }`
- Saves initial status, calls Camunda REST API
- Waits up to `SYNC_TIMEOUT_MS` for completion
- Returns 200 with result if completed, 202 with statusUrl if timeout

**`GET /api/process/status/:correlationId`**

- Get status of a single process
- Returns 404 if not found, 200/202/500 based on status

**`GET /api/process/status/all`**

- List all processes in the store (debugging)

**`POST /api/process/complete`**

- Called by final Camunda task to complete the process
- Updates store, wakes waiting clients, removes from Map
- Body: `{ correlationId, status: 'ok' | 'error', data?, error? }`

### Camunda Integration

**`src/services/camunda-rest.service.ts`**

- HTTP client for Camunda REST API
- `startProcessInstance()` method to trigger processes

**`src/camunda/processes/onboard-user/topics/prepare-response/`**

- New final task handler for the onboard-user process
- Aggregates all results and calls `/api/process/complete`
- Topic: `onboard-user.prepare-response`

## Configuration

New environment variable in `src/plugins/env.ts`:

```bash
SYNC_TIMEOUT_MS=25000  # Timeout for synchronous wait (default: 25s)
```

## Flow Example

1. External client → `POST /api/process/start`

   ```json
   {
     "processKey": "onboard-user",
     "correlationId": "user-123",
     "variables": {
       "userId": "user-123",
       "email": "user@example.com"
     }
   }
   ```

2. API saves status, calls Camunda REST API, creates wait

3. Camunda executes tasks in sequence:

   - validate-user-information
   - run-background-check
   - call-onboarding-api
   - **prepare-response** (new final task)

4. prepare-response → `POST /api/process/complete`

   ```json
   {
     "correlationId": "user-123",
     "status": "ok",
     "data": { "success": true, "userId": "user-123", ... }
   }
   ```

5. Complete endpoint updates store, wakes waiting client

6. Client receives response:
   - **If completed within 25s:** 200 with result
   - **If timeout:** 202 with `statusUrl: "/api/process/status/user-123"`

## Key Features

- **In-memory first**: Map provides instant access to process status
- **Async DB persistence**: Database writes are fire-and-forget, don't block responses
- **Automatic cleanup**: Processes removed from Map 5s after completion
- **Redis-ready**: Map can be replaced with Redis in the future
- **Route auto-loading**: Using @fastify/autoload for route discovery
- **Type-safe**: Full TypeScript support with Zod schemas

## Testing

The process store uses the existing event log for step-by-step audit trail, while the process store table stores the overall process state.

To test the flow:

```bash
# Start the server
pnpm run dev

# Start a process
curl -X POST http://localhost:8080/api/process/start \
  -H "Content-Type: application/json" \
  -d '{"processKey":"onboard-user","correlationId":"test-123","variables":{"userId":"test"}}'

# Check status (if you got 202)
curl http://localhost:8080/api/process/status/test-123

# List all processes
curl http://localhost:8080/api/process/status/all
```

## Database Schema

The process store table should have this schema (stub queries provided in repo):

```sql
CREATE TABLE process_store (
  correlation_id VARCHAR(255) PRIMARY KEY,
  status VARCHAR(50) NOT NULL,
  data NVARCHAR(MAX),  -- JSON
  error NVARCHAR(MAX),
  started_at DATETIME2 NOT NULL,
  updated_at DATETIME2 NOT NULL
);
```

## Future Enhancements

- Replace in-memory Map with Redis for distributed deployments
- Add process expiration/cleanup job for old completed processes
- Add metrics and monitoring for process duration and success rates
- Support for process cancellation
