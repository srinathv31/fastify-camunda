# Repositories Reference

Repositories provide database access patterns and encapsulate data persistence logic. All repositories are in `src/repositories/`.

## Overview

Repositories separate database operations from business logic:

- **Encapsulation**: Database queries in one place
- **Testability**: Easy to mock for unit tests
- **Reusability**: Shared across multiple services
- **Maintenance**: Change database schema in one place

## Repository Pattern

```typescript
// Repository provides clean interface
export async function findUser(db: Db, userId: string): Promise<User | null> {
  const result = await db.query("SELECT * FROM users WHERE id = @userId", [
    userId,
  ]);
  return result.recordset[0] || null;
}

// Service uses repository
async function myService(input: InVars, ctx: { app: FastifyInstance }) {
  const user = await findUser(ctx.app.db, input.userId);
  // ... business logic
}
```

## process-store.repo.ts

**Purpose**: Database operations for process store persistence.

### Database Schema

```sql
CREATE TABLE process_store (
  correlation_id VARCHAR(255) PRIMARY KEY,
  status VARCHAR(50) NOT NULL,
  data NVARCHAR(MAX),  -- JSON
  error NVARCHAR(MAX),
  started_at DATETIME2 NOT NULL,
  updated_at DATETIME2 NOT NULL,
  INDEX idx_status (status),
  INDEX idx_updated_at (updated_at)
);
```

### Functions

#### upsertProcessStore

Insert or update a process record.

```typescript
async function upsertProcessStore(
  db: Db,
  correlationId: string,
  data: ProcessData
): Promise<void>;
```

**Parameters**:

- `db`: Database connection
- `correlationId`: Process identifier
- `data`: Process state data

**SQL Operation**:

```sql
MERGE INTO process_store AS target
USING (VALUES (@cid, @status, @data, @error, @started, @updated)) AS source (...)
ON target.correlation_id = source.correlation_id
WHEN MATCHED THEN
  UPDATE SET status = source.status, ...
WHEN NOT MATCHED THEN
  INSERT (...) VALUES (...);
```

**Usage**:

```typescript
await upsertProcessStore(app.db, "user-123", {
  status: "ok",
  data: { success: true },
  error: null,
  startedAt: "2025-10-28T10:30:00.000Z",
  updatedAt: "2025-10-28T10:30:15.000Z",
});
```

**Notes**:

- Fire-and-forget operation (errors logged but don't fail)
- Called automatically by process store plugin
- Uses MERGE for upsert behavior

#### findProcessStore

Find a single process by correlation ID.

```typescript
async function findProcessStore(
  db: Db,
  correlationId: string
): Promise<ProcessData | null>;
```

**Parameters**:

- `db`: Database connection
- `correlationId`: Process identifier

**Returns**: Process data or `null` if not found

**Usage**:

```typescript
const process = await findProcessStore(app.db, "user-123");
if (process) {
  console.log(`Status: ${process.status}`);
}
```

#### findAllProcessStore

Find all processes in the database.

```typescript
async function findAllProcessStore(db: Db): Promise<ProcessData[]>;
```

**Parameters**:

- `db`: Database connection

**Returns**: Array of all process records

**Usage**:

```typescript
const all = await findAllProcessStore(app.db);
console.log(`Total processes: ${all.length}`);
```

**SQL**:

```sql
SELECT correlation_id, status, data, error, started_at, updated_at
FROM process_store
ORDER BY updated_at DESC;
```

---

## event-log.repo.ts

**Purpose**: Database operations for event logging (stub).

### Database Schema

```sql
CREATE TABLE event_log (
  id INT IDENTITY(1,1) PRIMARY KEY,
  correlation_id VARCHAR(255) NOT NULL,
  step_name VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL,
  http_method VARCHAR(10),
  endpoint VARCHAR(500),
  request_data NVARCHAR(MAX),  -- JSON
  response_data NVARCHAR(MAX),  -- JSON
  error_message NVARCHAR(MAX),
  created_at DATETIME2 DEFAULT GETDATE(),
  INDEX idx_correlation_id (correlation_id),
  INDEX idx_created_at (created_at),
  INDEX idx_status (status)
);
```

### Usage

Event logging is handled by the `eventLog` plugin, which writes directly to the database. The repository pattern is provided for consistency but not currently used.

### Querying Event Logs

```typescript
// Get all events for a process
const events = await app.db.query(
  `SELECT * FROM event_log 
   WHERE correlation_id = @correlationId 
   ORDER BY created_at`,
  [correlationId]
);

// Get recent errors
const errors = await app.db.query(
  `SELECT TOP 100 * FROM event_log 
   WHERE status = 'error' 
   ORDER BY created_at DESC`
);

// Get events for a specific step
const stepEvents = await app.db.query(
  `SELECT * FROM event_log 
   WHERE step_name = @stepName 
   ORDER BY created_at DESC`,
  [stepName]
);
```

---

## user.repo.ts

**Purpose**: User data access (application-specific example).

This is an example repository for application-specific data. Adapt to your needs.

### Example Functions

```typescript
export async function findUserById(
  db: Db,
  userId: string
): Promise<User | null> {
  const result = await db.query("SELECT * FROM users WHERE id = @userId", [
    userId,
  ]);
  return result.recordset[0] || null;
}

export async function createUser(
  db: Db,
  userData: CreateUserInput
): Promise<User> {
  const result = await db.query(
    `INSERT INTO users (id, email, name, created_at) 
     OUTPUT INSERTED.* 
     VALUES (@id, @email, @name, GETDATE())`,
    [userData.id, userData.email, userData.name]
  );
  return result.recordset[0];
}

export async function updateUser(
  db: Db,
  userId: string,
  updates: Partial<User>
): Promise<void> {
  const fields = Object.keys(updates)
    .map((key, idx) => `${key} = @param${idx}`)
    .join(", ");

  await db.query(
    `UPDATE users SET ${fields}, updated_at = GETDATE() WHERE id = @userId`,
    [userId, ...Object.values(updates)]
  );
}
```

---

## Creating New Repositories

### Repository Structure

```typescript
// src/repositories/payment.repo.ts
import { Db } from "../plugins/db";

export interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
}

export async function findPayment(
  db: Db,
  paymentId: string
): Promise<Payment | null> {
  const result = await db.query(
    "SELECT * FROM payments WHERE id = @paymentId",
    [paymentId]
  );
  return result.recordset[0] || null;
}

export async function createPayment(
  db: Db,
  payment: Omit<Payment, "id" | "created_at">
): Promise<Payment> {
  const id = generateUUID();
  const result = await db.query(
    `INSERT INTO payments (id, amount, currency, status, created_at) 
     OUTPUT INSERTED.* 
     VALUES (@id, @amount, @currency, @status, GETDATE())`,
    [id, payment.amount, payment.currency, payment.status]
  );
  return result.recordset[0];
}
```

### Best Practices

**Do's**:

- ✅ Keep repositories focused (one table or related tables)
- ✅ Return typed objects, not raw query results
- ✅ Use parameterized queries (prevent SQL injection)
- ✅ Handle `null` returns explicitly
- ✅ Parse JSON columns in repository
- ✅ Use descriptive function names (`findByEmail`, not `get`)

**Don'ts**:

- ❌ Don't include business logic in repositories
- ❌ Don't call other repositories from repositories
- ❌ Don't access `app` instance directly (pass `db` parameter)
- ❌ Don't return internal database error objects
- ❌ Don't build SQL strings from user input

### Testing Repositories

```typescript
describe("findPayment", () => {
  let mockDb: jest.Mocked<Db>;

  beforeEach(() => {
    mockDb = {
      query: jest.fn(),
    } as any;
  });

  it("returns payment when found", async () => {
    mockDb.query.mockResolvedValue({
      recordset: [{ id: "pay-123", amount: 100 }],
    });

    const payment = await findPayment(mockDb, "pay-123");

    expect(payment).toEqual({ id: "pay-123", amount: 100 });
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining("SELECT"),
      ["pay-123"]
    );
  });

  it("returns null when not found", async () => {
    mockDb.query.mockResolvedValue({ recordset: [] });

    const payment = await findPayment(mockDb, "invalid");

    expect(payment).toBeNull();
  });
});
```

## Query Patterns

### Parameterized Queries

Always use parameters to prevent SQL injection:

```typescript
// ✅ CORRECT
const result = await db.query("SELECT * FROM users WHERE email = @email", [
  userEmail,
]);

// ❌ WRONG (SQL injection risk!)
const result = await db.query(
  `SELECT * FROM users WHERE email = '${userEmail}'`
);
```

### Handling JSON Columns

```typescript
// Save JSON
await db.query("INSERT INTO logs (data) VALUES (@data)", [
  JSON.stringify(data),
]);

// Retrieve JSON
const result = await db.query("SELECT data FROM logs WHERE id = @id", [id]);
const parsed = JSON.parse(result.recordset[0].data);
```

### Transactions

```typescript
async function transferFunds(
  db: Db,
  fromAccount: string,
  toAccount: string,
  amount: number
): Promise<void> {
  const transaction = db.transaction();
  try {
    await transaction.begin();

    await transaction.query(
      "UPDATE accounts SET balance = balance - @amount WHERE id = @id",
      [amount, fromAccount]
    );

    await transaction.query(
      "UPDATE accounts SET balance = balance + @amount WHERE id = @id",
      [amount, toAccount]
    );

    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}
```

### Pagination

```typescript
async function findPaymentsPaginated(
  db: Db,
  page: number,
  pageSize: number
): Promise<{ payments: Payment[]; total: number }> {
  const offset = (page - 1) * pageSize;

  const [countResult, paymentsResult] = await Promise.all([
    db.query("SELECT COUNT(*) as total FROM payments"),
    db.query(
      `SELECT * FROM payments 
       ORDER BY created_at DESC 
       OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`,
      [offset, pageSize]
    ),
  ]);

  return {
    payments: paymentsResult.recordset,
    total: countResult.recordset[0].total,
  };
}
```

## Performance Considerations

### Indexes

Ensure indexes on frequently queried columns:

- Primary keys (automatic)
- Foreign keys
- Columns in WHERE clauses
- Columns in ORDER BY
- Columns in JOIN conditions

### Connection Pooling

Configured in `src/plugins/db.ts`:

- Connection pool reuses connections
- Don't manually create connections
- Let pool manage lifecycle

### Query Optimization

- Use `SELECT` with specific columns, not `SELECT *`
- Add WHERE clauses to limit rows
- Use appropriate indexes
- Avoid N+1 queries (use JOINs or batch queries)

## Related Documentation

- [Plugins Reference](plugins.md): Database plugin
- [Services Reference](services.md): Services using repositories
- [Core Libraries](core-libraries.md): Helper libraries
