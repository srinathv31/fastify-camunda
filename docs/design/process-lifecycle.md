# Process Lifecycle

Complete flow of a process from initiation through completion, including all state transitions and system interactions.

## Lifecycle Overview

A process moves through these states:

```
┌─────────┐     ┌─────────┐     ┌──────────┐     ┌───────────┐
│ Pending │ ──> │ Running │ ──> │ Finished │ ──> │ Completed │
└─────────┘     └─────────┘     └──────────┘     └───────────┘
                                       │
                                       ↓
                                 ┌─────────┐
                                 │  Error  │
                                 └─────────┘
```

- **Pending**: Process start request received, waiting for Camunda
- **Running**: Camunda executing tasks
- **Finished**: All tasks complete, final result available
- **Completed**: Stored in DB, removed from memory
- **Error**: Process failed at some step

## Detailed Lifecycle Phases

### Phase 1: Initiation

**Trigger**: Client calls `POST /api/process/start`

**Actions**:

1. REST API validates request body (processKey, correlationId, variables)
2. Generate execution context IDs:
   - `batch_id`: UUID for this batch
   - `traceability_id`: UUID for tracing
   - `application_id`: UUID for application context
3. Create initial process store entry:
   ```json
   {
     "status": "pending",
     "data": { "step": "queued" },
     "startedAt": "2025-10-28T10:30:00.000Z",
     "updatedAt": "2025-10-28T10:30:00.000Z"
   }
   ```
4. Save to process store (Map + async DB)

**State**: `pending`

**Database**:

- `process_store`: 1 row inserted
- `event_log`: No entries yet

---

### Phase 2: Start Process

**Actions**:

1. Create wait promise in waitroom (timeout: 25s)
2. Convert variables to Camunda format:
   ```typescript
   {
     correlationId: { value: "user-123", type: "String" },
     batch_id: { value: "...", type: "String" },
     // ... other variables
   }
   ```
3. Call Camunda REST API:
   ```
   POST /engine-rest/process-definition/key/{processKey}/start
   ```
4. Camunda returns process instance ID
5. Wait for completion or timeout

**State**: `pending` → `running` (in Camunda)

**Parallel Flows**:

- **Main thread**: Waits on promise
- **Camunda**: Begins executing BPMN process
- **Workers**: Poll for external tasks

---

### Phase 3: Task Execution

**For each service task in BPMN**:

#### 3a. Task Creation

1. Camunda encounters service task in BPMN
2. Creates external task with topic (e.g., `onboard-user.validate-user-information`)
3. Task enters Camunda's external task queue
4. Task is locked and available for fetching

#### 3b. Task Fetching

1. Worker polls Camunda: `POST /engine-rest/external-task/fetchAndLock`
2. Camunda returns tasks matching subscribed topics
3. Tasks are locked for `CAMUNDA_LOCK_DURATION_MS` (default: 20s)
4. Worker receives task with all process variables

#### 3c. Task Processing

1. **subscribeTopic wrapper** handles task:

   - Extract variables from task
   - Extract execution context (batch_id, traceability_id, etc.)
   - Validate input with Zod schema
   - Call service with validated input
   - Handle result or error

2. **Service executes**:

   - Access dependencies (database, APIs)
   - Perform business logic
   - Return output variables
   - Throw BusinessRuleError if business rule violated

3. **Complete task**:

   - Convert output to Camunda variables
   - Call `task.complete()` with output
   - Or call `task.handleBpmnError()` on error

4. **Log event**:
   - Record step completion in event_log
   - Include request/response data, status, execution time

#### 3d. Task Completion

1. Camunda receives completion
2. Updates process variables with output
3. Proceeds to next step in BPMN
4. Repeats until all tasks complete

**State**: `running`

**Database**:

- `event_log`: 1 row per step execution

---

### Phase 4: Process Completion

**Trigger**: Final task (`prepare-response`) executes

**Actions**:

1. **prepare-response service**:

   - Aggregate results from all previous steps
   - Prepare final result object
   - Call `POST /api/process/complete`:
     ```json
     {
       "correlationId": "user-123",
       "status": "ok",
       "data": {
         "success": true,
         "validationResult": { ... },
         "backgroundCheckResult": { ... },
         "onboardingResult": { ... }
       }
     }
     ```

2. **Complete endpoint** (`/api/process/complete`):

   - Update process store with final status and data
   - Call `completeWait()` to resolve waiting promise
   - Log completion
   - Schedule removal from memory (5s delay)

3. **Waiting client** (if any):
   - Promise resolves with result
   - `POST /api/process/start` returns 200 with data

**State**: `pending`/`running` → `ok` or `error`

**Database**:

- `process_store`: Updated with final status and data
- `event_log`: Final task logged

---

### Phase 5: Cleanup

**Trigger**: 5 seconds after completion

**Actions**:

1. Remove from in-memory Map
2. Database record persists for historical queries
3. Camunda process instance marked complete

**State**: `ok`/`error` → removed from memory

**Database**:

- `process_store`: Row remains
- `event_log`: All rows remain

---

## State Transitions

### Happy Path

```
Pending → Running → Finished (ok) → Completed (removed from memory)
```

Timeline:

- **T+0s**: Client starts process
- **T+0s**: Status saved, wait created, Camunda called
- **T+0-25s**: Tasks execute in sequence
- **T+15s**: Final task calls complete endpoint
- **T+15s**: Client receives 200 response
- **T+20s**: Removed from in-memory Map

### Timeout Path

```
Pending → Running → Timeout (202) → Running → Finished (ok) → Completed
```

Timeline:

- **T+0s**: Client starts process
- **T+0s**: Status saved, wait created, Camunda called
- **T+0-25s**: Tasks executing (slow process)
- **T+25s**: Wait timeout expires
- **T+25s**: Client receives 202 with statusUrl
- **T+30s**: Tasks still executing
- **T+40s**: Final task calls complete endpoint
- **T+40s**: Status updated to "ok"
- **T+40s**: Client polls statusUrl, receives 200 with data
- **T+45s**: Removed from in-memory Map

### Error Path

```
Pending → Running → Error → Finished (error) → Completed
```

Timeline:

- **T+0s**: Client starts process
- **T+0s**: Status saved, wait created, Camunda called
- **T+0-5s**: Task 1 executes successfully
- **T+5s**: Task 2 throws BusinessRuleError
- **T+5s**: Error handler task executes
- **T+5s**: Error handler calls complete endpoint with status="error"
- **T+5s**: Client receives error (if waiting) or 500 on status check
- **T+10s**: Removed from in-memory Map

## Variable Flow

Variables flow through the process:

```
Start Request
    ↓
  {userId, email}
    ↓
Step 1: Validate User
    ↓
  {userId, email, validated, normalizedUserId}
    ↓
Step 2: Background Check
    ↓
  {userId, email, validated, normalizedUserId, backgroundCheckPassed}
    ↓
Step 3: Call Onboarding API
    ↓
  {userId, ..., onboardingSuccess, accountId}
    ↓
Step 4: Prepare Response
    ↓
  {aggregated final result}
    ↓
Complete Endpoint
```

Variables accumulate through the process. Each step:

- Receives all previous variables
- Adds its own output variables
- Passes accumulated variables to next step

## Event Log Trail

Every step is logged:

```sql
SELECT
  step_name,
  status,
  http_status_code,
  result,
  created_at
FROM event_log
WHERE correlation_id = 'user-123'
ORDER BY created_at;
```

Example result:

```
step_name                     | status | http_status_code | result                           | created_at
------------------------------|--------|------------------|----------------------------------|-------------------
validate-user-information     | ok     | 200              | User information validated       | 10:30:01.123
run-background-check          | ok     | 200              | Background check completed       | 10:30:05.456
call-onboarding-api           | ok     | 201              | Onboarding API call successful   | 10:30:10.789
prepare-response              | ok     | 200              | Response prepared                | 10:30:12.012
```

## Timing Considerations

### Fast Process (< 25s)

- **Client experience**: Immediate response
- **HTTP pattern**: Synchronous (200)
- **Polling**: Not needed
- **Best for**: Simple validations, data lookups

### Slow Process (> 25s)

- **Client experience**: 202 response, then polling
- **HTTP pattern**: Asynchronous (202 → poll → 200)
- **Polling interval**: Recommended exponential backoff
- **Best for**: External API calls, complex processing, human tasks

### Very Slow Process (> 5 minutes)

- **Recommendation**: Use webhooks instead of polling
- **Alternative**: Server-Sent Events (SSE) for real-time updates
- **Consideration**: Waitroom not suitable for very long processes

## Monitoring the Lifecycle

### Check Current Status

```bash
curl http://localhost:8080/api/process/status/user-123
```

### View All Steps

```sql
SELECT * FROM event_log
WHERE correlation_id = 'user-123'
ORDER BY created_at;
```

### Check Active Processes

```bash
curl http://localhost:8080/api/process/status/all
```

### Camunda Process Instance

```bash
curl http://localhost:8080/engine-rest/process-instance?businessKey=user-123
```

## Error Recovery

### Automatic Retry

Camunda can retry failed tasks:

```xml
<bpmn:serviceTask id="Task" camunda:asyncBefore="true" camunda:retries="3">
  ...
</bpmn:serviceTask>
```

### Manual Retry

Via Camunda Cockpit:

1. View process instance
2. Find failed task
3. Increment retries
4. Task will be retried

### Cancel Process

```bash
curl -X DELETE http://localhost:8080/engine-rest/process-instance/{processInstanceId}
```

## Related Documentation

- [Architecture Overview](architecture-overview.md): System components
- [Callback Strategy](callback-strategy.md): Sync/async pattern details
- [Data Model](data-model.md): Data structures
- [Understanding the System](../guides/understanding-the-system.md): User-friendly explanation
