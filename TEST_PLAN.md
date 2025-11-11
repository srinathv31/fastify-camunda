# MSSQL Waitroom Test Plan

## Unit Tests

### ✅ Completed: waitroom.test.ts

The unit tests have been updated to test the new DB-backed implementation with a mock database:

- ✅ `createWait()` polls and resolves on DONE status
- ✅ `createWait()` times out after specified duration
- ✅ `createWait()` rejects on ERROR status
- ✅ `completeWait()` updates database to DONE
- ✅ `failWait()` updates database to ERROR
- ✅ `hasPendingWait()` checks PENDING status
- ✅ `getPendingCount()` counts PENDING processes
- ✅ `clearAll()` updates all PENDING to ERROR

Run unit tests:

```bash
npm test
```

## Integration Tests

### Prerequisites

1. **MSSQL Database Running**
   - Local: SQL Server on Docker/native
   - Cloud: Azure SQL Database
2. **Database Initialized**

   ```bash
   sqlcmd -S localhost -U sa -P YourPassword -d test_db -i migrations/001_create_process_store.sql
   ```

3. **Environment Configured**
   ```env
   DB_HOST=localhost
   DB_NAME=test_db
   DB_USER=sa
   DB_PASSWORD=YourPassword
   SYNC_TIMEOUT_MS=25000
   ```

### Test 1: Basic Request-Response Flow

**Purpose**: Verify single request completes successfully

**Steps**:

1. Start server: `npm run dev`
2. Send request:
   ```bash
   curl -X POST http://localhost:8080/api/process/start \
     -H "Content-Type: application/json" \
     -d '{
       "processKey": "onboard-user",
       "correlationId": "test-basic-001",
       "variables": {}
     }'
   ```
3. Verify response is 200 OK with result
4. Check database:
   ```sql
   SELECT * FROM dbo.process_store WHERE correlation_id = 'test-basic-001';
   ```
5. Verify row exists with status='DONE' (or removed after 5s)

**Expected**:

- Response: `{"status":"ok","correlationId":"test-basic-001","result":{...}}`
- Status code: 200
- DB row: DONE status or removed

### Test 2: Timeout Handling

**Purpose**: Verify 202 response when process exceeds timeout

**Steps**:

1. Set short timeout: `SYNC_TIMEOUT_MS=1000`
2. Start server
3. Send request with same correlation ID
4. Verify response is 202 Accepted

**Expected**:

- Response: `{"status":"pending","correlationId":"...","statusUrl":"/api/process/status/..."}`
- Status code: 202
- DB row: PENDING status

### Test 3: Polling Status Endpoint

**Purpose**: Verify status endpoint works for timed-out requests

**Steps**:

1. Trigger timeout (Test 2)
2. Poll status endpoint:
   ```bash
   curl http://localhost:8080/api/process/status/test-timeout-001
   ```
3. Verify status updates as process progresses
4. Final status should be DONE or ERROR

**Expected**:

- Initial: `{"status":"pending",...}`
- Final: `{"status":"ok","data":{...}}` or `{"status":"error","error":"..."}`

### Test 4: Multiple Concurrent Requests

**Purpose**: Verify polling doesn't interfere between requests

**Steps**:

1. Send 10 concurrent requests with unique correlation IDs:
   ```bash
   for i in {1..10}; do
     curl -X POST http://localhost:8080/api/process/start \
       -H "Content-Type: application/json" \
       -d "{\"processKey\":\"onboard-user\",\"correlationId\":\"test-concurrent-$i\"}" &
   done
   wait
   ```
2. Verify all return 200 OK (or mix of 200/202)
3. Check database for all 10 processes

**Expected**:

- All requests complete successfully
- No correlation ID conflicts
- DB shows all 10 processes (DONE or ERROR)

### Test 5: Multi-Instance Coordination

**Purpose**: Verify multiple server instances can share state

**Steps**:

1. Start Instance A on port 8080
2. Start Instance B on port 8081 (same DB config)
3. Send request to Instance A:
   ```bash
   curl -X POST http://localhost:8080/api/process/start \
     -H "Content-Type: application/json" \
     -d '{"processKey":"onboard-user","correlationId":"test-multi-001"}'
   ```
4. While waiting, check database from both instances
5. If using Camunda, completion may come via Instance B

**Expected**:

- Request to Instance A returns 200 OK
- Both instances can read same DB state
- Completion works regardless of which instance receives callback

### Test 6: Server Restart Persistence

**Purpose**: Verify state survives server restart

**Steps**:

1. Send request: `curl ... -d '{"correlationId":"test-restart-001"}'`
2. Immediately kill server (Ctrl+C) before completion
3. Check database - should have PENDING row
4. Restart server
5. Check database - row should still exist
6. Send status query: `curl http://localhost:8080/api/process/status/test-restart-001`

**Expected**:

- PENDING row persists after restart
- Status endpoint returns current state
- Process either completes or times out eventually

### Test 7: Error Handling

**Purpose**: Verify error states are handled correctly

**Steps**:

1. Send request with invalid data (will trigger error in Camunda)
2. Verify response is 200 OK with error details
3. Check database - status should be ERROR

**Expected**:

- Response: `{"status":"ok","correlationId":"...","result":{"success":false,"reason":"..."}}`
- DB row: ERROR status with error_json populated

### Test 8: Cleanup Verification

**Purpose**: Verify completed processes are cleaned up

**Steps**:

1. Send request and wait for completion
2. Immediately check database - row should exist
3. Wait 6 seconds
4. Check database again - row should be removed

**Expected**:

- Row exists immediately after completion
- Row removed after 5-second delay

### Test 9: Lock Contention Under Load

**Purpose**: Verify locking works under high concurrent load

**Steps**:

1. Send 100 requests with same correlation ID simultaneously:
   ```bash
   for i in {1..100}; do
     curl -X POST http://localhost:8080/api/process/start \
       -H "Content-Type: application/json" \
       -d '{"processKey":"onboard-user","correlationId":"test-contention-001"}' &
   done
   wait
   ```
2. Check server logs for lock timeout warnings
3. Verify database has only 1 row for this correlation ID

**Expected**:

- Only one process created (no duplicates)
- Some requests may fail with 500 (expected under this test)
- No database deadlocks or corruption

### Test 10: Graceful Shutdown

**Purpose**: Verify pending waits are cleared on shutdown

**Steps**:

1. Send request: `curl ... -d '{"correlationId":"test-shutdown-001"}'`
2. Immediately shut down server (SIGTERM)
3. Check database - status should be ERROR with "shutdown" message

**Expected**:

- All PENDING rows updated to ERROR
- Shutdown completes cleanly without hanging

## Performance Tests

### Test 11: Polling Overhead

**Purpose**: Measure database load from polling

**Steps**:

1. Enable query logging in MSSQL
2. Send request with 10-second process duration
3. Count number of SELECT queries during wait
4. Calculate queries per second

**Expected**:

- ~10-20 queries over 10 seconds (exponential backoff should reduce frequency)
- No excessive polling (>100 queries/sec)

### Test 12: Throughput

**Purpose**: Measure maximum concurrent processes

**Steps**:

1. Send 1000 concurrent requests
2. Measure time to complete all
3. Check for failures or timeouts

**Expected**:

- > 100 requests/sec throughput
- <1% failure rate
- No database connection pool exhaustion

## Manual Verification Checklist

- [ ] Database migration runs without errors
- [ ] Server starts with DB connection successful
- [ ] Single request returns 200 OK
- [ ] Timeout returns 202 Accepted
- [ ] Status endpoint works for pending processes
- [ ] Multiple concurrent requests work
- [ ] Process state persists across restarts
- [ ] Cleanup removes completed processes
- [ ] Logs show polling activity
- [ ] No memory leaks over 1000 requests
- [ ] Multi-instance coordination works
- [ ] Graceful shutdown clears pending waits

## Debugging Tips

### Enable Detailed Logging

Set log level to DEBUG to see SQL queries:

```env
LOG_LEVEL=debug
```

### Monitor Database

Watch processes in real-time:

```sql
-- Run this query repeatedly
SELECT
  correlation_id,
  status,
  DATEDIFF(SECOND, started_at, SYSUTCDATETIME()) as age_seconds,
  DATEDIFF(SECOND, updated_at, SYSUTCDATETIME()) as idle_seconds
FROM dbo.process_store
ORDER BY updated_at DESC;
```

### Check Locks

Monitor database locks:

```sql
SELECT
  request_session_id,
  resource_type,
  resource_description,
  request_mode,
  request_status
FROM sys.dm_tran_locks
WHERE resource_database_id = DB_ID('your_database_name');
```

## Known Issues / Limitations

1. **Lock Timeouts**: Under extreme load, lock timeout errors may occur. These are handled gracefully (retry on next poll).
2. **Cleanup Delay**: 5-second delay before cleanup means rows temporarily remain after completion.
3. **Polling Overhead**: Each waiting request polls database ~1-2 times/second at peak. With 100 concurrent waits, that's ~100-200 queries/sec.

## Success Criteria

✅ All unit tests pass
✅ Basic integration tests (1-4) pass
✅ Multi-instance test (5) passes
✅ Restart persistence test (6) passes
✅ No database deadlocks or corruption
✅ Acceptable performance (<100ms p99 latency)
