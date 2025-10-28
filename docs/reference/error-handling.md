# Error Handling Reference

Comprehensive guide to error types, handling patterns, and best practices in fastify-camunda.

## Error Types

### BusinessRuleError

**Purpose**: Expected business rule violations

**Source**: `src/lib/errors.ts`

**Usage**:

```typescript
import { BusinessRuleError } from "../lib/errors";

if (!isValidEmail(email)) {
  throw new BusinessRuleError("INVALID_EMAIL", "Email format is invalid", {
    email,
    reason: "format",
  });
}
```

**Properties**:

- `code`: Error code (SCREAMING_SNAKE_CASE)
- `message`: Human-readable message
- `details`: Additional context object

**Handling**:

- Converted to BPMN error by `subscribeTopic`
- HTTP status: 400 Bad Request
- Logged to event_log
- Process routes to error handler (if defined)

### ZodError

**Purpose**: Input validation failures

**Source**: Zod library

**Occurs**: When schema validation fails

```typescript
const InVars = z.object({
  amount: z.number().positive(),
  currency: z.string().length(3),
});

// Throws ZodError if validation fails
const parsed = InVars.parse(input);
```

**Handling**:

- Automatically caught by `subscribeTopic`
- HTTP status: 422 Unprocessable Entity
- Includes detailed validation errors
- Logged to event_log

**Error Structure**:

```json
{
  "name": "ZodError",
  "issues": [
    {
      "code": "invalid_type",
      "expected": "number",
      "received": "string",
      "path": ["amount"],
      "message": "Expected number, received string"
    }
  ]
}
```

### Technical Errors

**Purpose**: Unexpected system errors

**Examples**:

- Database connection failures
- Network timeouts
- File system errors
- Out of memory

**Handling**:

- HTTP status: 500 Internal Server Error
- Logged to event_log
- Process fails or routes to error handler
- Retried by Camunda (based on configuration)

## Error Flow

### In Process Steps

```typescript
export async function myService(
  input: InVars,
  ctx: { app: FastifyInstance }
): Promise<OutVars> {
  // 1. Validation (automatic via Zod)
  // Input already validated before service is called

  // 2. Business rule validation
  if (input.amount > 10000) {
    throw new BusinessRuleError(
      "AMOUNT_TOO_HIGH",
      "Amount exceeds maximum allowed",
      { amount: input.amount, max: 10000 }
    );
  }

  // 3. Technical operations
  try {
    const result = await ctx.app.db.query("SELECT ...", [input.id]);
    return { success: true, data: result };
  } catch (err) {
    // Log and re-throw technical errors
    ctx.app.log.error({ err }, "Database query failed");
    throw err;
  }
}
```

### Error Propagation

```
1. Service throws error
   ↓
2. subscribeTopic catches error
   ↓
3. Error converted to BPMN error (toBpmnError)
   ↓
4. Error logged to event_log
   ↓
5. BPMN error sent to Camunda
   ↓
6. Process routes to error handler (if defined)
   ↓
7. Error handler processes error
   ↓
8. Process completes with error status
```

## Error Mapping

### BusinessRuleError → BPMN Error

```typescript
{
  code: 'EMPLOYEE_CARD_ERROR',  // Standard BPMN error code
  message: 'Email format is invalid',
  details: {
    errorType: 'INVALID_EMAIL',  // Original error code
    email: 'bad-email',           // Error details
    reason: 'format'
  }
}
```

**HTTP Status**: 400 Bad Request

### ZodError → BPMN Error

```typescript
{
  code: 'EMPLOYEE_CARD_ERROR',
  message: 'Input validation failed',
  details: {
    errorType: 'VALIDATION_ERROR',
    zodError: [/* Zod validation errors */]
  }
}
```

**HTTP Status**: 422 Unprocessable Entity

### Technical Error → BPMN Error

```typescript
{
  code: 'EMPLOYEE_CARD_ERROR',
  message: 'Database connection failed',
  details: {
    errorType: 'TECHNICAL_ERROR'
  }
}
```

**HTTP Status**: 500 Internal Server Error

## Error Handling Patterns

### Pattern 1: Validate Early

```typescript
export async function processPayment(input: InVars): Promise<OutVars> {
  // Validate all inputs upfront
  if (input.amount <= 0) {
    throw new BusinessRuleError("INVALID_AMOUNT", "Amount must be positive");
  }

  if (!SUPPORTED_CURRENCIES.includes(input.currency)) {
    throw new BusinessRuleError(
      "UNSUPPORTED_CURRENCY",
      `Currency ${input.currency} not supported`
    );
  }

  // Proceed with processing
  // ...
}
```

### Pattern 2: Wrap External Calls

```typescript
export async function callExternalAPI(data: any): Promise<any> {
  try {
    const response = await httpService({
      url: "https://api.example.com/endpoint",
      method: "POST",
      body: data,
      timeout: 5000,
    });

    return response.data;
  } catch (err) {
    // Convert to BusinessRuleError for expected failures
    if (err.statusCode === 400) {
      throw new BusinessRuleError("INVALID_REQUEST", "API rejected request", {
        originalError: err.message,
      });
    }

    // Let technical errors propagate
    throw err;
  }
}
```

### Pattern 3: Partial Success

```typescript
export async function processBatch(
  items: Item[]
): Promise<{
  succeeded: Item[];
  failed: Array<{ item: Item; error: string }>;
}> {
  const succeeded: Item[] = [];
  const failed: Array<{ item: Item; error: string }> = [];

  for (const item of items) {
    try {
      await processItem(item);
      succeeded.push(item);
    } catch (err) {
      failed.push({
        item,
        error: err.message,
      });
    }
  }

  // Return partial results, let caller decide how to handle
  return { succeeded, failed };
}
```

### Pattern 4: Graceful Degradation

```typescript
export async function getEnrichedData(id: string): Promise<Data> {
  const mainData = await fetchMainData(id);

  // Try to enrich with additional data, but don't fail if unavailable
  let enrichmentData = null;
  try {
    enrichmentData = await fetchEnrichmentData(id);
  } catch (err) {
    // Log error but continue
    logger.warn({ err, id }, "Enrichment data unavailable");
  }

  return {
    ...mainData,
    enrichment: enrichmentData,
  };
}
```

## Error Response Formats

### REST API Errors

**400 Bad Request**:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "body must have required property 'correlationId'"
}
```

**404 Not Found**:

```json
{
  "status": "not_found",
  "correlationId": "invalid-id"
}
```

**500 Internal Server Error**:

```json
{
  "status": "error",
  "correlationId": "user-123",
  "error": "Process execution failed: Database connection timeout"
}
```

### Event Log Errors

```sql
SELECT * FROM event_log WHERE status = 'error'
```

Result:

```json
{
  "correlation_id": "user-123",
  "step_name": "validate-user-information",
  "status": "error",
  "http_method": null,
  "endpoint": null,
  "request_data": "{\"userId\":\"user-123\"}",
  "response_data": "{\"error\":\"User not found\"}",
  "error_message": "User validation failed",
  "http_status_code": 400,
  "metadata": "{\"errorType\":\"USER_NOT_FOUND\"}",
  "created_at": "2025-10-28T10:30:15.000Z"
}
```

## BPMN Error Handling

### Error Boundary Events

Define error handlers in BPMN:

```xml
<bpmn:serviceTask id="ValidatePayment" name="Validate Payment">
  <bpmn:extensionElements>
    <camunda:errorEventDefinition
      errorRef="Error_ValidationFailed"
      expression="${error.errorType == 'VALIDATION_ERROR'}" />
  </bpmn:extensionElements>
</bpmn:serviceTask>

<bpmn:boundaryEvent id="ValidationError" attachedToRef="ValidatePayment">
  <bpmn:errorEventDefinition errorRef="Error_ValidationFailed" />
</bpmn:boundaryEvent>

<bpmn:sequenceFlow sourceRef="ValidationError" targetRef="HandleError" />
```

### Error Handler Task

```typescript
// src/camunda/processes/process-payment/topics/handle-error/service.ts
export async function handleErrorService(
  input: InVars,
  ctx: { app: FastifyInstance }
): Promise<OutVars> {
  const { correlationId, errorCode, errorMessage, errorType } = input;

  // Log error
  ctx.app.log.error(
    {
      correlationId,
      errorCode,
      errorMessage,
      errorType,
    },
    "Process error handled"
  );

  // Notify external system
  await fetch(`http://localhost:8080/api/process/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      correlationId,
      status: "error",
      error: errorMessage,
    }),
  });

  return {
    handled: true,
  };
}
```

## Logging Errors

### Service-Level Logging

```typescript
export async function myService(input: InVars, ctx: { app: FastifyInstance }) {
  try {
    // business logic
  } catch (err) {
    ctx.app.log.error(
      {
        err,
        input,
        context: "myService",
      },
      "Service execution failed"
    );
    throw err;
  }
}
```

### Automatic Logging

`subscribeTopic` automatically logs:

- All errors to event_log table
- Error type and details
- HTTP status code
- Request/response data
- Execution time

## Best Practices

### Do's

- ✅ Use `BusinessRuleError` for expected business failures
- ✅ Include detailed context in error details
- ✅ Log errors before re-throwing
- ✅ Map errors to appropriate HTTP status codes
- ✅ Test both success and error paths
- ✅ Define BPMN error handlers for critical processes
- ✅ Validate inputs early
- ✅ Use descriptive error codes

### Don'ts

- ❌ Don't catch and swallow errors without logging
- ❌ Don't use generic error messages
- ❌ Don't include sensitive data in error messages
- ❌ Don't retry non-idempotent operations blindly
- ❌ Don't use errors for control flow
- ❌ Don't expose internal implementation details in errors
- ❌ Don't catch errors just to re-throw them unchanged

## Testing Error Scenarios

```typescript
describe("validatePaymentService", () => {
  it("throws BusinessRuleError for unsupported currency", async () => {
    await expect(
      validatePaymentService(
        {
          amount: 100,
          currency: "XYZ",
          customerId: "c1",
          paymentMethodId: "pm1",
        },
        { app: mockApp }
      )
    ).rejects.toThrow(BusinessRuleError);
  });

  it("propagates database errors", async () => {
    mockApp.db.query.mockRejectedValue(new Error("DB connection failed"));

    await expect(
      validatePaymentService(input, { app: mockApp })
    ).rejects.toThrow("DB connection failed");
  });

  it("handles timeout errors", async () => {
    jest.useFakeTimers();

    const promise = validatePaymentService(input, { app: mockApp });
    jest.advanceTimersByTime(10000);

    await expect(promise).rejects.toThrow("Timeout");

    jest.useRealTimers();
  });
});
```

## Monitoring and Alerts

### Error Rate Monitoring

```sql
-- Error rate by step
SELECT
  step_name,
  COUNT(*) as total,
  SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors,
  (SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) * 100.0 / COUNT(*)) as error_rate
FROM event_log
WHERE created_at > DATEADD(hour, -1, GETDATE())
GROUP BY step_name
ORDER BY error_rate DESC;
```

### Alert on High Error Rate

```typescript
async function checkErrorRate(): Promise<void> {
  const result = await app.db.query(`
    SELECT COUNT(*) as error_count
    FROM event_log
    WHERE status = 'error'
    AND created_at > DATEADD(minute, -5, GETDATE())
  `);

  const errorCount = result.recordset[0].error_count;

  if (errorCount > 10) {
    // Send alert
    await sendAlert({
      severity: "high",
      message: `High error rate detected: ${errorCount} errors in last 5 minutes`,
    });
  }
}
```

## Related Documentation

- [Core Libraries](core-libraries.md): Error utilities
- [Services](services.md): Service error handling
- [Creating a Process](../guides/creating-a-process.md): Error handling in processes
- [Testing Guide](../guides/testing-guide.md): Testing errors
