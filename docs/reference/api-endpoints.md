# API Endpoints Reference

Complete specification of all REST API endpoints provided by fastify-camunda.

## Base URL

All endpoints are prefixed with `/api/process` and are auto-loaded from `src/routes/process/`.

```
http://localhost:8080/api/process
```

## Authentication

Currently, no authentication is required. Add authentication middleware in `src/server.ts` if needed.

## Common Response Codes

- **200 OK**: Request succeeded
- **202 Accepted**: Process started but not yet completed
- **400 Bad Request**: Invalid request parameters
- **404 Not Found**: Resource not found
- **500 Internal Server Error**: Server or process error

## Endpoints

### POST /api/process/start

Start a new process instance in Camunda and wait for completion or timeout.

#### Request

**Headers**:

```
Content-Type: application/json
```

**Body**:

```typescript
{
  processKey: string;        // Required: Process definition key
  correlationId: string;     // Required: Unique process identifier
  variables?: {              // Optional: Process variables
    [key: string]: any;
  };
}
```

**Example**:

```json
{
  "processKey": "onboard-user",
  "correlationId": "user-123-20251028",
  "variables": {
    "userId": "user-123",
    "email": "john@example.com"
  }
}
```

#### Response

**Success (200 OK)**: Process completed within timeout

```typescript
{
  status: "ok";
  correlationId: string;
  result: any; // Process result data
}
```

Example:

```json
{
  "status": "ok",
  "correlationId": "user-123-20251028",
  "result": {
    "validationResult": { "valid": true },
    "backgroundCheckResult": { "cleared": true },
    "onboardingResult": { "success": true }
  }
}
```

**Accepted (202)**: Process still running after timeout

```typescript
{
  status: "pending";
  correlationId: string;
  statusUrl: string; // URL to poll for status
}
```

Example:

```json
{
  "status": "pending",
  "correlationId": "user-123-20251028",
  "statusUrl": "/api/process/status/user-123-20251028"
}
```

**Error (500)**: Process start failed

```typescript
{
  status: "error";
  correlationId: string;
  error: string; // Error message
}
```

Example:

```json
{
  "status": "error",
  "correlationId": "user-123-20251028",
  "error": "Failed to start process: Invalid process key"
}
```

#### Validation Rules

- `processKey`: Must be non-empty string, must match deployed BPMN process
- `correlationId`: Must be non-empty string, should be unique
- `variables`: Must be valid JSON object if provided

#### Behavior

1. Validates request body
2. Generates execution context IDs (batch_id, traceability_id, application_id)
3. Saves initial status (`pending`) to process store
4. Creates wait promise in waitroom with timeout (default 25s)
5. Calls Camunda REST API to start process instance
6. Waits for process completion or timeout:
   - **Completed**: Returns 200 with result
   - **Timeout**: Returns 202 with status URL

#### cURL Example

```bash
curl -X POST http://localhost:8080/api/process/start \
  -H "Content-Type: application/json" \
  -d '{
    "processKey": "onboard-user",
    "correlationId": "user-001",
    "variables": {
      "userId": "user-001"
    }
  }'
```

---

### GET /api/process/status/:correlationId

Get the current status of a process by its correlation ID.

#### Request

**Path Parameters**:

- `correlationId` (string, required): The process correlation ID

**Example**:

```
GET /api/process/status/user-123-20251028
```

#### Response

**Success (200 OK)**: Process completed successfully

```typescript
{
  status: "ok";
  correlationId: string;
  data: any; // Process result
  startedAt: string; // ISO 8601 timestamp
  updatedAt: string; // ISO 8601 timestamp
}
```

Example:

```json
{
  "status": "ok",
  "correlationId": "user-123-20251028",
  "data": {
    "success": true,
    "userId": "user-123"
  },
  "startedAt": "2025-10-28T10:30:00.000Z",
  "updatedAt": "2025-10-28T10:30:15.432Z"
}
```

**Pending (202 Accepted)**: Process still running

```typescript
{
  status: "pending";
  correlationId: string;
  data?: any;                // Partial data if available
  startedAt: string;
  updatedAt: string;
}
```

Example:

```json
{
  "status": "pending",
  "correlationId": "user-123-20251028",
  "data": {
    "step": "run-background-check"
  },
  "startedAt": "2025-10-28T10:30:00.000Z",
  "updatedAt": "2025-10-28T10:30:10.123Z"
}
```

**Error (500 Internal Server Error)**: Process failed

```typescript
{
  status: "error";
  correlationId: string;
  error: string;             // Error message
  data?: any;                // Partial data before error
  startedAt: string;
  updatedAt: string;
}
```

Example:

```json
{
  "status": "error",
  "correlationId": "user-123-20251028",
  "error": "Background check service unavailable",
  "startedAt": "2025-10-28T10:30:00.000Z",
  "updatedAt": "2025-10-28T10:30:12.567Z"
}
```

**Not Found (404)**: Process not found

```typescript
{
  status: "not_found";
  correlationId: string;
}
```

Example:

```json
{
  "status": "not_found",
  "correlationId": "non-existent-id"
}
```

#### Behavior

1. Queries in-memory process store Map
2. Falls back to database if not in memory
3. Returns status with appropriate HTTP code
4. Removed from memory 5 seconds after completion

#### Polling Strategy

For 202 responses, poll at increasing intervals:

```javascript
async function pollStatus(correlationId, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(`/api/process/status/${correlationId}`);
    const data = await response.json();

    if (response.status === 200) {
      return data; // Success
    } else if (response.status === 500) {
      throw new Error(data.error); // Failed
    }

    // Still pending, wait and retry
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(1000 * (i + 1), 10000))
    );
  }
  throw new Error("Polling timeout");
}
```

#### cURL Example

```bash
curl http://localhost:8080/api/process/status/user-001
```

---

### GET /api/process/status/all

List all processes currently in the process store. Useful for debugging.

#### Request

**Query Parameters**: None

**Example**:

```
GET /api/process/status/all
```

#### Response

**Success (200 OK)**:

```typescript
{
  count: number;
  processes: Array<{
    correlationId: string;
    status: "pending" | "ok" | "error";
    data?: any;
    error?: string;
    startedAt: string;
    updatedAt: string;
  }>;
}
```

Example:

```json
{
  "count": 3,
  "processes": [
    {
      "correlationId": "user-001",
      "status": "ok",
      "data": { "success": true },
      "startedAt": "2025-10-28T10:30:00.000Z",
      "updatedAt": "2025-10-28T10:30:15.000Z"
    },
    {
      "correlationId": "user-002",
      "status": "pending",
      "data": { "step": "validate-user-information" },
      "startedAt": "2025-10-28T10:31:00.000Z",
      "updatedAt": "2025-10-28T10:31:05.000Z"
    },
    {
      "correlationId": "user-003",
      "status": "error",
      "error": "Validation failed",
      "startedAt": "2025-10-28T10:32:00.000Z",
      "updatedAt": "2025-10-28T10:32:03.000Z"
    }
  ]
}
```

#### Behavior

1. Retrieves all entries from in-memory Map
2. Returns array with count
3. Includes completed processes (for ~5 seconds after completion)
4. Does not query database (only in-memory data)

#### Use Cases

- Monitoring active processes
- Debugging process flow
- Health checks
- Development/testing

#### cURL Example

```bash
curl http://localhost:8080/api/process/status/all
```

---

### POST /api/process/complete

Mark a process as completed. Called by the final task in a Camunda process to signal completion and wake waiting clients.

**Note**: This endpoint is typically called by Camunda tasks, not external clients.

#### Request

**Headers**:

```
Content-Type: application/json
```

**Body**:

```typescript
{
  correlationId: string;     // Required: Process identifier
  status: "ok" | "error";    // Required: Final status
  data?: any;                // Optional: Result data (for ok status)
  error?: string;            // Optional: Error message (for error status)
}
```

**Example (Success)**:

```json
{
  "correlationId": "user-123-20251028",
  "status": "ok",
  "data": {
    "success": true,
    "userId": "user-123",
    "validationResult": { "valid": true },
    "backgroundCheckResult": { "cleared": true },
    "onboardingResult": { "accountId": "acc-456" }
  }
}
```

**Example (Error)**:

```json
{
  "correlationId": "user-123-20251028",
  "status": "error",
  "error": "Background check failed: criminal record found"
}
```

#### Response

**Success (200 OK)**: Always returns 200 to prevent Camunda retry loops

```typescript
{
  received: true;
}
```

Example:

```json
{
  "received": true
}
```

#### Validation Rules

- `correlationId`: Must be non-empty string
- `status`: Must be "ok" or "error"
- `data`: Included when status is "ok"
- `error`: Included when status is "error"

#### Behavior

1. Updates process store with final status and data/error
2. Calls `completeWait()` or `failWait()` to wake any waiting clients
3. Schedules removal from in-memory Map after 5 seconds
4. Always returns 200 OK (avoids Camunda retry on errors)

#### Side Effects

- Waiting clients (from `/start` endpoint) receive immediate response
- Process status changes from `pending` to `ok` or `error`
- After 5 seconds, process removed from in-memory Map
- Database record persists indefinitely

#### Usage in Process

Call from final task service:

```typescript
// In prepare-response/service.ts
export async function prepareResponseService(
  input: InVars,
  ctx: { app: FastifyInstance }
): Promise<OutVars> {
  const { correlationId, ...allResults } = input;

  const finalResult = {
    success: true,
    results: allResults,
  };

  // Call complete endpoint
  await fetch(`http://localhost:8080/api/process/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      correlationId,
      status: "ok",
      data: finalResult,
    }),
  });

  return { completionSent: true };
}
```

#### cURL Example

```bash
curl -X POST http://localhost:8080/api/process/complete \
  -H "Content-Type: application/json" \
  -d '{
    "correlationId": "user-001",
    "status": "ok",
    "data": {
      "success": true,
      "userId": "user-001"
    }
  }'
```

---

## Error Handling

### Client Errors (4xx)

**400 Bad Request**: Invalid request format or missing required fields

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "body must have required property 'correlationId'"
}
```

**404 Not Found**: Resource doesn't exist

```json
{
  "status": "not_found",
  "correlationId": "invalid-id"
}
```

### Server Errors (5xx)

**500 Internal Server Error**: Process failed or unexpected error

```json
{
  "status": "error",
  "correlationId": "user-123",
  "error": "Background check service timeout"
}
```

## Rate Limiting

No rate limiting is currently enforced. Add `@fastify/rate-limit` plugin if needed:

```typescript
import rateLimit from "@fastify/rate-limit";

await app.register(rateLimit, {
  max: 100,
  timeWindow: "1 minute",
});
```

## CORS

CORS is not enabled by default. Add `@fastify/cors` plugin if needed:

```typescript
import cors from "@fastify/cors";

await app.register(cors, {
  origin: true,
});
```

## Monitoring

Use the `/ping` endpoint for health checks:

```bash
curl http://localhost:8080/ping
# Returns: "pong"
```

## Related Documentation

- [Understanding the System](../guides/understanding-the-system.md): Learn the sync/async pattern
- [Creating a Process](../guides/creating-a-process.md): Implement new workflows
- [Callback Strategy](../design/callback-strategy.md): Implementation details
