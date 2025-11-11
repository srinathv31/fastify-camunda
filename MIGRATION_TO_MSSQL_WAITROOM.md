# Migration to MSSQL-Backed Waitroom

## Overview

The waitroom has been migrated from an in-memory `Map` to an MSSQL-backed polling system. This change enables:

- ✅ **Multi-instance support**: Multiple server instances can share state
- ✅ **Persistence**: State survives server restarts
- ✅ **No memory leaks**: State is stored in database, not process memory
- ✅ **Same API**: Minimal code changes required

## Architecture

### Before (In-Memory Map)

- Process waits stored in `Map<string, Pending>`
- `createWait()` creates Promise, stores in Map
- `completeWait()`/`failWait()` resolve/reject from Map
- ❌ Lost on restart
- ❌ Doesn't work across instances

### After (MSSQL Polling)

- Process state stored in `process_store` table
- `createWait()` polls database with exponential backoff (50ms → 1000ms)
- `completeWait()`/`failWait()` update database row
- ✅ Persists across restarts
- ✅ Works across multiple instances

## Database Setup

### 1. Run Migration

Execute the migration script to create the required table:

```bash
# Using sqlcmd
sqlcmd -S localhost -U sa -P YourPassword -d YourDatabase -i migrations/001_create_process_store.sql

# Or using Azure Data Studio / SSMS
# Open migrations/001_create_process_store.sql and execute
```

### 2. Configure Environment Variables

Create a `.env` file (or update existing one) with database credentials:

```env
# Database Configuration
DB_HOST=localhost
DB_NAME=your_database_name
DB_USER=your_username
DB_PASSWORD=your_password

# Optional: Timeout configuration
SYNC_TIMEOUT_MS=25000
```

## How It Works

### Polling Pattern

When a client calls `/api/process/start`:

1. **Initialize**: Row inserted with `status='PENDING'`
2. **Poll**: Client polls database every 50-1000ms (exponential backoff)
3. **Complete**: When Camunda finishes, row updated to `status='DONE'` or `status='ERROR'`
4. **Return**: Poller detects change and returns result

### Locking Strategy

- **Upsert (PENDING)**: Uses `UPDLOCK, HOLDLOCK` to prevent races
- **Complete/Fail**: Simple `UPDATE` by correlation_id
- **Poll Read**: Uses `READCOMMITTEDLOCK, ROWLOCK` with 200ms lock timeout

### Performance

- **Single row queries**: Each poll reads only one row by primary key
- **Exponential backoff**: Starts at 50ms, caps at 1000ms to reduce DB load
- **Row-level locking**: Minimal contention, no table locks
- **Index on status**: Efficient pending count queries

## API Changes

All waitroom functions now require a `db` parameter:

### Before

```typescript
const result = await createWait(correlationId, timeout);
completeWait(correlationId, data);
failWait(correlationId, error);
```

### After

```typescript
const result = await createWait(app.db, correlationId, timeout);
await completeWait(app.db, correlationId, data);
await failWait(app.db, correlationId, error);
```

## Testing

### Manual Test

1. Start the server:

```bash
npm run dev
```

2. Send a request:

```bash
curl -X POST http://localhost:8080/api/process/start \
  -H "Content-Type: application/json" \
  -d '{
    "processKey": "onboard-user",
    "correlationId": "test-123",
    "variables": {}
  }'
```

3. Check database:

```sql
SELECT * FROM dbo.process_store WHERE correlation_id = 'test-123';
```

### Multi-Instance Test

1. Start two server instances on different ports:

```bash
# Terminal 1
PORT=8080 npm run dev

# Terminal 2
PORT=8081 npm run dev
```

2. Send request to instance 1
3. Complete via instance 2
4. Result should return to instance 1's waiting client

## Monitoring

### Check Pending Processes

```sql
SELECT COUNT(*) FROM dbo.process_store WHERE status = 'PENDING';
```

### View All Processes

```sql
SELECT correlation_id, status, updated_at
FROM dbo.process_store
ORDER BY updated_at DESC;
```

### Find Stale Processes (older than 1 hour)

```sql
SELECT correlation_id, status, started_at, updated_at
FROM dbo.process_store
WHERE status = 'PENDING'
  AND updated_at < DATEADD(HOUR, -1, SYSUTCDATETIME());
```

## Cleanup

Process rows are automatically removed 5 seconds after completion. For additional cleanup:

```sql
-- Delete completed processes older than 24 hours
DELETE FROM dbo.process_store
WHERE status IN ('DONE', 'ERROR')
  AND updated_at < DATEADD(HOUR, -24, SYSUTCDATETIME());
```

You may want to set up a scheduled job for periodic cleanup.

## Troubleshooting

### Issue: "Cannot connect to database"

- Verify DB credentials in `.env`
- Check network connectivity to SQL Server
- Ensure database exists and user has permissions

### Issue: "Lock timeout exceeded"

- This is expected occasionally under high load
- The poller will retry on next cycle (50-1000ms later)
- If frequent, consider increasing `LOCK_TIMEOUT` in `process-store.repo.ts`

### Issue: "Process always times out"

- Check if Camunda workers are running
- Verify callback routes are being called
- Check database for stuck PENDING rows

### Issue: "Multiple instances not working"

- Ensure all instances connect to the **same** database
- Check that DB credentials are identical across instances
- Verify network connectivity between instances and DB

## Rollback (if needed)

To rollback to in-memory Map (not recommended for production):

1. Revert changes to `waitroom.ts`
2. Revert changes to `process-store.ts`
3. Comment out DB plugin in `server.ts`
4. Remove `db` parameters from all function calls

## Next Steps

- Monitor database performance under load
- Set up cleanup job for old rows
- Consider adding alerting for stuck PENDING processes
- Load test with multiple concurrent requests
