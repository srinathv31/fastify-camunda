# Data Model

Complete documentation of database schemas and in-memory data structures used in fastify-camunda.

## Database Tables

### process_store

**Purpose**: Persistent storage for process state

**Schema**:

```sql
CREATE TABLE process_store (
  correlation_id VARCHAR(255) PRIMARY KEY,
  status VARCHAR(50) NOT NULL,
  data NVARCHAR(MAX),
  error NVARCHAR(MAX),
  started_at DATETIME2 NOT NULL,
  updated_at DATETIME2 NOT NULL,
  INDEX idx_status (status),
  INDEX idx_updated_at (updated_at)
);
```

**Columns**:

| Column           | Type          | Null     | Description                              |
| ---------------- | ------------- | -------- | ---------------------------------------- |
| `correlation_id` | VARCHAR(255)  | NOT NULL | Primary key, unique process identifier   |
| `status`         | VARCHAR(50)   | NOT NULL | Process status: `pending`, `ok`, `error` |
| `data`           | NVARCHAR(MAX) | NULL     | JSON result data (on success)            |
| `error`          | NVARCHAR(MAX) | NULL     | Error message (on failure)               |
| `started_at`     | DATETIME2     | NOT NULL | Process start timestamp                  |
| `updated_at`     | DATETIME2     | NOT NULL | Last update timestamp                    |

**Indexes**:

- `PRIMARY KEY` on `correlation_id` - Fast lookup by ID
- `idx_status` on `status` - Query by status
- `idx_updated_at` on `updated_at` - Query recent processes

**Sample Data**:

```json
{
  "correlation_id": "user-123-20251028",
  "status": "ok",
  "data": "{\"success\":true,\"userId\":\"user-123\"}",
  "error": null,
  "started_at": "2025-10-28T10:30:00.000Z",
  "updated_at": "2025-10-28T10:30:15.432Z"
}
```

**Usage Patterns**:

- **Insert**: On process start
- **Update**: On status changes, completion
- **Select**: Status polling, historical queries
- **Never deleted**: Remains for audit trail

---

### event_log

**Purpose**: Audit trail for all process steps

**Schema**:

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
  http_status_code INT,
  batch_id VARCHAR(255),
  traceability_id VARCHAR(255),
  application_id VARCHAR(255),
  target_system VARCHAR(255),
  originating_system VARCHAR(255),
  process_name VARCHAR(255),
  step INT,
  identifiers NVARCHAR(MAX),
  result NVARCHAR(MAX),
  metadata NVARCHAR(MAX),
  execution_time INT,
  created_at DATETIME2 DEFAULT GETDATE(),
  INDEX idx_correlation_id (correlation_id),
  INDEX idx_created_at (created_at),
  INDEX idx_status (status),
  INDEX idx_step_name (step_name)
);
```

**Columns**:

| Column               | Type          | Description                                      |
| -------------------- | ------------- | ------------------------------------------------ |
| `id`                 | INT IDENTITY  | Auto-increment primary key                       |
| `correlation_id`     | VARCHAR(255)  | Process identifier                               |
| `step_name`          | VARCHAR(255)  | Step name (e.g., validate-user-information)      |
| `status`             | VARCHAR(50)   | `ok` or `error`                                  |
| `http_method`        | VARCHAR(10)   | HTTP method if external API called               |
| `endpoint`           | VARCHAR(500)  | API endpoint if external API called              |
| `request_data`       | NVARCHAR(MAX) | JSON input to step (business_action_request)     |
| `response_data`      | NVARCHAR(MAX) | JSON output from step (business_action_response) |
| `error_message`      | NVARCHAR(MAX) | Error details if failed                          |
| `http_status_code`   | INT           | HTTP status code (200, 400, 500, etc.)           |
| `batch_id`           | VARCHAR(255)  | Batch identifier                                 |
| `traceability_id`    | VARCHAR(255)  | Traceability identifier                          |
| `application_id`     | VARCHAR(255)  | Application identifier                           |
| `target_system`      | VARCHAR(255)  | Target system name                               |
| `originating_system` | VARCHAR(255)  | Originating system name                          |
| `process_name`       | VARCHAR(255)  | Process name                                     |
| `step`               | INT           | Step number in process                           |
| `identifiers`        | NVARCHAR(MAX) | JSON identifiers object                          |
| `result`             | NVARCHAR(MAX) | Human-readable result message                    |
| `metadata`           | NVARCHAR(MAX) | Additional JSON metadata                         |
| `execution_time`     | INT           | Execution time in milliseconds                   |
| `created_at`         | DATETIME2     | Event timestamp                                  |

**Sample Data**:

```json
{
  "id": 1,
  "correlation_id": "user-123-20251028",
  "step_name": "validate-user-information",
  "status": "ok",
  "http_method": null,
  "endpoint": null,
  "request_data": "{\"userId\":\"user-123\"}",
  "response_data": "{\"validated\":true,\"normalizedUserId\":\"user-123\"}",
  "error_message": null,
  "http_status_code": 200,
  "batch_id": "batch-uuid",
  "traceability_id": "trace-uuid",
  "application_id": "app-uuid",
  "target_system": "CamundaEngine",
  "originating_system": "FastifyAPI",
  "process_name": "onboard-user",
  "step": 1,
  "identifiers": "{\"applicationId\":\"app-uuid\"}",
  "result": "User information validated",
  "metadata": "{\"message\":\"user validated\"}",
  "execution_time": 123,
  "created_at": "2025-10-28T10:30:01.123Z"
}
```

**Usage Patterns**:

- **Insert**: On every step completion
- **Select**: Query by correlation_id for audit trail
- **Analytics**: Aggregations for monitoring
- **Never updated or deleted**: Append-only log

---

## In-Memory Data Structures

### Waitroom Map

**Purpose**: Track pending promises for waiting clients

**Structure**:

```typescript
type Pending = {
  resolve: (v: any) => void;
  reject: (e: any) => void;
  timeout: NodeJS.Timeout;
};

const pending = new Map<string, Pending>();
```

**Key**: `correlationId` (string)

**Value**: Object with promise resolve/reject functions and timeout

**Lifecycle**:

- **Created**: When `createWait()` called
- **Resolved**: When `completeWait()` called
- **Rejected**: When `failWait()` called or timeout
- **Deleted**: On resolution, rejection, or timeout

**Characteristics**:

- **Fast**: O(1) lookup, insert, delete
- **Ephemeral**: Cleared on server restart
- **Memory**: ~1KB per entry
- **Limit**: None (scales with available memory)

---

### Process Store Map

**Purpose**: Fast access to current process state

**Structure**:

```typescript
interface ProcessData {
  status: "pending" | "ok" | "error";
  data?: any;
  error?: string;
  startedAt?: string;
  updatedAt?: string;
}

const store = new Map<string, ProcessData>();
```

**Key**: `correlationId` (string)

**Value**: Process state object

**Lifecycle**:

- **Created**: On process start
- **Updated**: On status changes
- **Deleted**: 5 seconds after completion
- **Persisted**: Async writes to database

**Characteristics**:

- **Fast**: O(1) operations
- **Ephemeral**: Cleared on restart
- **Backed by DB**: Falls back to database if not in memory
- **Memory**: Variable (depends on data size)

**Example**:

```json
{
  "user-123": {
    "status": "ok",
    "data": { "success": true, "userId": "user-123" },
    "error": null,
    "startedAt": "2025-10-28T10:30:00.000Z",
    "updatedAt": "2025-10-28T10:30:15.000Z"
  }
}
```

---

## Camunda Process Variables

**Storage**: Camunda database (separate from fastify-camunda)

**Format**: Key-value pairs with type information

**Structure**:

```json
{
  "correlationId": {
    "value": "user-123",
    "type": "String"
  },
  "userId": {
    "value": "user-123",
    "type": "String"
  },
  "validated": {
    "value": true,
    "type": "Boolean"
  },
  "identifiers": {
    "value": "{\"applicationId\":\"app-uuid\",\"userId\":\"user-123\"}",
    "type": "Json",
    "serializationDataFormat": "application/json"
  }
}
```

**Types Supported**:

- **String**: Text
- **Integer**: Whole numbers
- **Long**: Large integers
- **Double**: Floating point
- **Boolean**: true/false
- **Date**: ISO 8601 dates
- **Json**: JSON objects (serialized as string)

**Lifecycle**:

- **Created**: When process starts
- **Updated**: By each task completion
- **Deleted**: When process completes (configurable in Camunda)

---

## Data Relationships

```
process_store (1) ←→ (N) event_log
  correlation_id ←→ correlation_id

One process has many events
```

**Queries**:

Get process with all events:

```sql
SELECT
  ps.correlation_id,
  ps.status,
  ps.data,
  ps.started_at,
  ps.updated_at,
  el.step_name,
  el.status as step_status,
  el.created_at as step_created_at
FROM process_store ps
LEFT JOIN event_log el ON ps.correlation_id = el.correlation_id
WHERE ps.correlation_id = @correlationId
ORDER BY el.created_at;
```

---

## Data Retention

### In-Memory

- **Waitroom**: Cleared on timeout (25s) or completion
- **Process Store Map**: Cleared 5s after completion
- **Total retention**: ~30 seconds per process

### Database

- **process_store**: Indefinite (implement cleanup job if needed)
- **event_log**: Indefinite (append-only audit log)

**Cleanup Recommendations**:

Archive old data:

```sql
-- Archive processes older than 90 days
INSERT INTO process_store_archive
SELECT * FROM process_store
WHERE updated_at < DATEADD(day, -90, GETDATE());

DELETE FROM process_store
WHERE updated_at < DATEADD(day, -90, GETDATE());
```

Similar for `event_log`.

---

## Data Volume Estimates

### Typical Process

- **process_store**: 1 row (~500 bytes with small data)
- **event_log**: 4-10 rows (~2KB per row) = 8-20KB
- **Total DB**: ~10-20KB per process

### Scale Estimates

| Processes/Day | DB Growth/Day | DB Growth/Year |
| ------------- | ------------- | -------------- |
| 100           | 2 MB          | 730 MB         |
| 1,000         | 20 MB         | 7.3 GB         |
| 10,000        | 200 MB        | 73 GB          |
| 100,000       | 2 GB          | 730 GB         |

**Memory Usage** (in-memory only):

- 100 concurrent: ~100 KB
- 1,000 concurrent: ~1 MB
- 10,000 concurrent: ~10 MB

---

## Performance Characteristics

### Database Operations

| Operation      | Table         | Complexity | Typical Time |
| -------------- | ------------- | ---------- | ------------ |
| Insert process | process_store | O(1)       | 5-10ms       |
| Update process | process_store | O(1)       | 5-10ms       |
| Get process    | process_store | O(1)       | 2-5ms        |
| Insert event   | event_log     | O(1)       | 5-10ms       |
| Get events     | event_log     | O(log n)   | 10-50ms      |

### In-Memory Operations

| Operation     | Structure | Complexity | Typical Time |
| ------------- | --------- | ---------- | ------------ |
| Create wait   | Waitroom  | O(1)       | < 0.01ms     |
| Complete wait | Waitroom  | O(1)       | < 0.01ms     |
| Save process  | Map       | O(1)       | < 0.01ms     |
| Get process   | Map       | O(1)       | < 0.01ms     |

**Optimization**: In-memory operations are ~1000x faster than database

---

## Data Migration

### Adding Columns

Safe operations (non-breaking):

```sql
-- Add optional column
ALTER TABLE event_log ADD user_agent VARCHAR(500) NULL;

-- Add with default
ALTER TABLE process_store ADD priority VARCHAR(50) DEFAULT 'normal' NOT NULL;
```

### Schema Version

Track schema version:

```sql
CREATE TABLE schema_version (
  version INT PRIMARY KEY,
  applied_at DATETIME2 DEFAULT GETDATE()
);

INSERT INTO schema_version (version) VALUES (1);
```

---

## Related Documentation

- [Repositories Reference](../reference/repositories.md): Database access patterns
- [Process Lifecycle](process-lifecycle.md): How data flows through processes
- [Architecture Overview](architecture-overview.md): System components
