# Services Reference

Services contain reusable business logic and external integrations. All services are in `src/services/`.

## Overview

Services provide:

- **Reusability**: Shared across multiple processes
- **Testability**: Pure functions easy to test
- **Integration**: Encapsulate external API calls
- **Separation**: Business logic separate from process orchestration

## Service Pattern

```typescript
// Service is a pure function
export async function myService(params: ServiceParams): Promise<ServiceResult> {
  // Business logic
  // Database queries
  // External API calls
  return result;
}

// Called from process step service
export async function stepService(
  input: InVars,
  ctx: { app: FastifyInstance }
): Promise<OutVars> {
  const result = await myService({ ...input, db: ctx.app.db });
  return { success: true, result };
}
```

## http.service.ts

**Purpose**: HTTP client for external API calls with timeout, retry, and error handling.

### Features

- Configurable timeout
- Automatic retries with exponential backoff
- Jitter to prevent thundering herd
- Error handling and logging
- Support for all HTTP methods

### Usage

```typescript
import { httpService } from "../services/http.service";

const response = await httpService({
  url: "https://api.example.com/endpoint",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer token",
  },
  body: { data: "value" },
  timeout: 5000, // 5 seconds
  retries: 3, // Retry up to 3 times
});

console.log(response.status); // 200
console.log(response.data); // Response body
```

### API

```typescript
interface HttpServiceOptions {
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  headers?: Record<string, string>;
  body?: any;
  timeout?: number; // milliseconds (default: 10000)
  retries?: number; // retry attempts (default: 3)
}

interface HttpServiceResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: any;
}

async function httpService(
  options: HttpServiceOptions
): Promise<HttpServiceResponse>;
```

### Error Handling

```typescript
try {
  const response = await httpService({ url: "..." });
} catch (err) {
  if (err.code === "TIMEOUT") {
    // Handle timeout
  } else if (err.statusCode >= 500) {
    // Server error
  } else if (err.statusCode >= 400) {
    // Client error
  }
}
```

### Retry Logic

- Retries on: 500+, network errors, timeouts
- No retry on: 400-499 (client errors)
- Exponential backoff: 1s, 2s, 4s
- Jitter: ±20% randomization

### Best Practices

- Set appropriate timeout for external API
- Use retries for transient failures
- Don't retry non-idempotent operations without care
- Log request/response for debugging

---

## camunda-rest.service.ts

**Purpose**: Client for Camunda REST API to start process instances.

### Functions

#### startProcessInstance

Start a new process instance in Camunda.

```typescript
async function startProcessInstance(
  baseUrl: string,
  request: StartProcessRequest
): Promise<ProcessInstance>;
```

**Parameters**:

```typescript
interface StartProcessRequest {
  key: string; // Process definition key
  businessKey?: string; // Optional business key
  variables?: Record<
    string,
    {
      // Process variables
      value: any;
      type: string;
      serializationDataFormat?: string;
    }
  >;
}
```

**Returns**:

```typescript
interface ProcessInstance {
  id: string; // Process instance ID
  definitionId: string;
  businessKey: string;
  caseInstanceId: string | null;
  ended: boolean;
  suspended: boolean;
  tenantId: string | null;
}
```

**Usage**:

```typescript
import { startProcessInstance } from "../services/camunda-rest.service";

const instance = await startProcessInstance(
  "http://localhost:8080/engine-rest",
  {
    key: "onboard-user",
    businessKey: "user-123",
    variables: {
      userId: { value: "user-123", type: "String" },
      email: { value: "user@example.com", type: "String" },
      metadata: {
        value: JSON.stringify({ source: "api" }),
        type: "Json",
        serializationDataFormat: "application/json",
      },
    },
  }
);

console.log(`Started process: ${instance.id}`);
```

### Variable Types

Camunda supports these variable types:

- **String**: Text values
- **Integer**: Whole numbers
- **Long**: Large whole numbers
- **Double**: Decimals
- **Boolean**: true/false
- **Json**: JSON objects (requires `serializationDataFormat`)
- **Date**: ISO 8601 dates

Example:

```typescript
variables: {
  name: { value: 'John', type: 'String' },
  age: { value: 30, type: 'Integer' },
  balance: { value: 1234.56, type: 'Double' },
  active: { value: true, type: 'Boolean' },
  metadata: {
    value: JSON.stringify({ key: 'value' }),
    type: 'Json',
    serializationDataFormat: 'application/json',
  },
}
```

### Error Handling

```typescript
try {
  const instance = await startProcessInstance(baseUrl, request);
} catch (err) {
  if (err.statusCode === 404) {
    // Process definition not found
  } else if (err.statusCode === 500) {
    // Camunda error
  }
  throw err;
}
```

---

## mssql.service.ts

**Purpose**: Database service utilities and helpers.

This service provides additional database utilities beyond the basic `db.query()` method.

### Example Functions

```typescript
export async function executeTransaction(
  db: Db,
  operations: Array<{ query: string; params: any[] }>
): Promise<void> {
  const transaction = db.transaction();
  try {
    await transaction.begin();
    for (const op of operations) {
      await transaction.query(op.query, op.params);
    }
    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function bulkInsert(
  db: Db,
  table: string,
  rows: Record<string, any>[]
): Promise<void> {
  // Implement bulk insert using MSSQL table-valued parameters
  // or multiple INSERT statements
}
```

---

## Creating New Services

### Service Structure

```typescript
// src/services/payment.service.ts

export interface PaymentServiceOptions {
  amount: number;
  currency: string;
  customerId: string;
  paymentMethodId: string;
}

export interface PaymentServiceResult {
  transactionId: string;
  status: "success" | "failed";
  message: string;
}

export async function processPayment(
  options: PaymentServiceOptions
): Promise<PaymentServiceResult> {
  const { amount, currency, customerId, paymentMethodId } = options;

  // Validate
  if (amount <= 0) {
    throw new Error("Invalid amount");
  }

  // Call payment gateway
  const response = await httpService({
    url: "https://payment-gateway.example.com/charge",
    method: "POST",
    body: {
      amount,
      currency,
      customer: customerId,
      payment_method: paymentMethodId,
    },
    timeout: 10000,
  });

  return {
    transactionId: response.data.id,
    status: response.data.status === "succeeded" ? "success" : "failed",
    message: response.data.message,
  };
}
```

### Using in Process Steps

```typescript
// In step service
import { processPayment } from "../../../services/payment.service";

export async function chargeCustomerService(
  input: InVars,
  ctx: { app: FastifyInstance }
): Promise<OutVars> {
  try {
    const result = await processPayment({
      amount: input.amount,
      currency: input.currency,
      customerId: input.customerId,
      paymentMethodId: input.paymentMethodId,
    });

    return {
      transactionId: result.transactionId,
      charged: result.status === "success",
      message: result.message,
    };
  } catch (err) {
    throw new BusinessRuleError("PAYMENT_FAILED", "Payment processing failed", {
      error: err.message,
    });
  }
}
```

## Best Practices

### Do's

- ✅ Keep services pure and stateless
- ✅ Accept parameters explicitly (don't access globals)
- ✅ Return typed results
- ✅ Handle errors appropriately
- ✅ Add logging for important operations
- ✅ Write unit tests for services
- ✅ Document expected behavior

### Don'ts

- ❌ Don't access Fastify app directly (pass dependencies)
- ❌ Don't mutate input parameters
- ❌ Don't catch and swallow errors without re-throwing
- ❌ Don't include Camunda-specific logic
- ❌ Don't mix multiple concerns in one service

### Testing Services

```typescript
describe("processPayment", () => {
  it("processes payment successfully", async () => {
    // Mock httpService
    jest.mock("../services/http.service");
    const httpService = require("../services/http.service").httpService;
    httpService.mockResolvedValue({
      status: 200,
      data: {
        id: "txn-123",
        status: "succeeded",
        message: "Payment successful",
      },
    });

    const result = await processPayment({
      amount: 100,
      currency: "USD",
      customerId: "cust-123",
      paymentMethodId: "pm-456",
    });

    expect(result.transactionId).toBe("txn-123");
    expect(result.status).toBe("success");
  });

  it("throws error for invalid amount", async () => {
    await expect(
      processPayment({
        amount: -100,
        currency: "USD",
        customerId: "cust-123",
        paymentMethodId: "pm-456",
      })
    ).rejects.toThrow("Invalid amount");
  });
});
```

## Service Categories

### Integration Services

External API integrations:

- Payment gateways
- Email services
- SMS services
- Third-party APIs

### Data Services

Data processing and transformation:

- Data validation
- Data transformation
- Aggregation
- Reporting

### Business Logic Services

Domain-specific logic:

- Business rules
- Calculations
- Workflow logic
- Decision making

## Performance Considerations

### Caching

```typescript
const cache = new Map<string, { data: any; expires: number }>();

export async function getCachedData(key: string): Promise<any> {
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  const data = await fetchData(key);
  cache.set(key, {
    data,
    expires: Date.now() + 60000, // 1 minute
  });

  return data;
}
```

### Parallel Execution

```typescript
export async function fetchMultipleResources(
  ids: string[]
): Promise<Resource[]> {
  // Execute in parallel
  const promises = ids.map((id) => fetchResource(id));
  return Promise.all(promises);
}
```

### Timeout Management

```typescript
export async function fetchWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Timeout")), timeoutMs);
  });

  return Promise.race([promise, timeout]);
}
```

## Related Documentation

- [Core Libraries](core-libraries.md): Helper libraries
- [Repositories](repositories.md): Database access
- [Error Handling](error-handling.md): Error patterns
- [Creating a Process](../guides/creating-a-process.md): Using services in processes
