# Creating a Process

This guide walks you through creating a new Camunda process from scratch. You'll learn the file structure, required components, and how to register your process with the system.

## Overview

Creating a process involves:

1. Define process structure and steps
2. Create topic handlers for each step
3. Write business logic services
4. Define input/output schemas
5. Register the process
6. Add tests

We'll create a `process-payment` workflow as an example.

## Step 1: Create Process Directory

Create a directory for your process:

```bash
mkdir -p src/camunda/processes/process-payment/topics
```

The structure will look like:

```
src/camunda/processes/process-payment/
├── shared.ts                    # Process definition and step metadata
└── topics/                      # Individual topic handlers
    ├── validate-payment/
    │   ├── handler.ts           # Topic subscription
    │   ├── schema.ts            # Zod schemas for in/out variables
    │   └── service.ts           # Business logic
    ├── charge-customer/
    │   ├── handler.ts
    │   ├── schema.ts
    │   └── service.ts
    └── prepare-response/
        ├── handler.ts
        ├── schema.ts
        └── service.ts
```

## Step 2: Define Process Metadata

Create `src/camunda/processes/process-payment/shared.ts`:

```typescript
import { defineProcess } from "../../../lib/define-process";

/**
 * Process-level defaults for the process-payment workflow.
 */
export const PROCESS_DEFAULTS = {
  target_system: "CamundaEngine",
  originating_system: "FastifyAPI",
  process_name: "process-payment",
} as const;

/**
 * Complete configuration for the process-payment process including step order,
 * HTTP metadata, and success/error messages.
 */
export const PROCESS_PAYMENT_PROCESS = defineProcess([
  "validate-payment",
  "charge-customer",
  "prepare-response",
  "handle-error",
] as const)({
  "validate-payment": {
    http_method: null,
    endpoint: null,
    success: { result: "Payment validated" },
    error: { result: "Payment validation failed" },
  },
  "charge-customer": {
    http_method: "POST",
    endpoint: "/payment/charge",
    success: { result: "Customer charged successfully" },
    error: { result: "Charge failed" },
  },
  "prepare-response": {
    http_method: null,
    endpoint: null,
    success: { result: "Response prepared" },
    error: { result: "Response preparation failed" },
  },
  "handle-error": {
    http_method: null,
    endpoint: null,
    success: { result: "Error handled" },
    error: { result: "Error handler failed" },
  },
});

export type ProcessPaymentStepName =
  (typeof PROCESS_PAYMENT_PROCESS.stepsInOrder)[number];

export const PROCESS_PAYMENT_STEPS = PROCESS_PAYMENT_PROCESS.compiled;
```

This defines:

- **Step order**: The sequence of steps in your process
- **Step metadata**: HTTP method, endpoint, success/error messages
- **Type safety**: TypeScript types for step names

## Step 3: Create Topic Handler

For each step, create handler, schema, and service files.

### Schema Definition

Create `src/camunda/processes/process-payment/topics/validate-payment/schema.ts`:

```typescript
import { z } from "zod";

/**
 * Input variables for the validate-payment task.
 * These come from the Camunda process variables.
 */
export const InVars = z.object({
  amount: z.number().positive(),
  currency: z.string().length(3),
  customerId: z.string().min(1),
  paymentMethodId: z.string().min(1),
});

export type InVars = z.infer<typeof InVars>;

/**
 * Output variables for the validate-payment task.
 * These are set back on the process instance.
 */
export const OutVars = z.object({
  isValid: z.boolean(),
  validationMessage: z.string(),
  normalizedAmount: z.number(),
});

export type OutVars = z.infer<typeof OutVars>;
```

Zod provides:

- Runtime validation
- TypeScript type inference
- Clear error messages

### Service Implementation

Create `src/camunda/processes/process-payment/topics/validate-payment/service.ts`:

```typescript
import { InVars, OutVars } from "./schema";
import { FastifyInstance } from "fastify";
import { BusinessRuleError } from "../../../../../lib/errors";

/**
 * Service implementation for the validate-payment task.
 * Encapsulates all business logic for payment validation.
 */
export async function validatePaymentService(
  input: InVars,
  ctx: { app: FastifyInstance }
): Promise<OutVars> {
  const { amount, currency, customerId, paymentMethodId } = input;

  // Validate currency
  const supportedCurrencies = ["USD", "EUR", "GBP"];
  if (!supportedCurrencies.includes(currency)) {
    throw new BusinessRuleError(
      "UNSUPPORTED_CURRENCY",
      `Currency ${currency} is not supported`
    );
  }

  // Validate amount limits
  if (amount > 10000) {
    throw new BusinessRuleError(
      "AMOUNT_TOO_HIGH",
      "Payments over $10,000 require manual approval"
    );
  }

  // Check customer exists
  const customer = await ctx.app.db.query(
    "SELECT id FROM customers WHERE id = @customerId",
    [customerId]
  );

  if (!customer.recordset.length) {
    throw new BusinessRuleError(
      "CUSTOMER_NOT_FOUND",
      `Customer ${customerId} not found`
    );
  }

  // Check payment method
  const paymentMethod = await ctx.app.db.query(
    "SELECT id, is_valid FROM payment_methods WHERE id = @paymentMethodId",
    [paymentMethodId]
  );

  if (!paymentMethod.recordset.length) {
    throw new BusinessRuleError(
      "PAYMENT_METHOD_NOT_FOUND",
      `Payment method ${paymentMethodId} not found`
    );
  }

  if (!paymentMethod.recordset[0].is_valid) {
    throw new BusinessRuleError(
      "PAYMENT_METHOD_INVALID",
      "Payment method is expired or invalid"
    );
  }

  return {
    isValid: true,
    validationMessage: "Payment validated successfully",
    normalizedAmount: Math.round(amount * 100) / 100, // Round to 2 decimals
  };
}
```

Best practices:

- Keep services pure and testable
- Use `BusinessRuleError` for expected failures
- Access dependencies through `ctx.app`
- Add clear error messages

### Handler Registration

Create `src/camunda/processes/process-payment/topics/validate-payment/handler.ts`:

```typescript
import { FastifyInstance } from "fastify";
import { subscribeTopic } from "../../../../../lib/subscribe-topic";
import { InVars, OutVars } from "./schema";
import { validatePaymentService } from "./service";
import { PROCESS_PAYMENT_STEPS, PROCESS_DEFAULTS } from "../../shared";

/**
 * Register the validate-payment topic subscription.
 */
export function registerValidatePayment(app: FastifyInstance): void {
  const stepConfig = PROCESS_PAYMENT_STEPS["validate-payment"];

  subscribeTopic<InVars, OutVars>(app, {
    topic: "process-payment.validate-payment",
    stepConfig,
    processDefaults: PROCESS_DEFAULTS,
    inSchema: InVars,
    service: validatePaymentService,
    resultMessage: (out) =>
      out.isValid ? "payment validated" : "payment invalid",
  });
}
```

The handler:

- Subscribes to the topic
- Connects schema and service
- Provides step metadata for event logging
- Generates human-readable result messages

## Step 4: Create Additional Steps

Repeat Step 3 for each remaining step:

- `charge-customer`: Execute payment charge
- `prepare-response`: Aggregate results and call `/api/process/complete`
- `handle-error`: Handle any errors in the process

### prepare-response Example

The final step must call the complete endpoint:

```typescript
// src/camunda/processes/process-payment/topics/prepare-response/service.ts
import { InVars, OutVars } from "./schema";
import { FastifyInstance } from "fastify";

export async function prepareResponseService(
  input: InVars,
  ctx: { app: FastifyInstance }
): Promise<OutVars> {
  const { correlationId, validationResult, chargeResult } = input;

  // Aggregate results
  const finalResult = {
    success: true,
    paymentId: chargeResult.paymentId,
    amount: chargeResult.amount,
    currency: chargeResult.currency,
    validationMessage: validationResult.validationMessage,
  };

  // Call the complete endpoint
  const baseUrl = ctx.app.config.CAMUNDA_BASE_URL.replace("/engine-rest", "");
  await fetch(`${baseUrl}/api/process/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      correlationId,
      status: "ok",
      data: finalResult,
    }),
  });

  return {
    completionSent: true,
  };
}
```

This completes the process and wakes any waiting clients.

## Step 5: Register Process

Add your process to the main registration file.

Edit `src/camunda/index.ts`:

```typescript
import { FastifyInstance } from "fastify";

// Existing imports
import { registerValidateUserInformation } from "./processes/onboard-user/topics/validate-user-information/handler";
// ... other onboard-user imports ...

// New process imports
import { registerValidatePayment } from "./processes/process-payment/topics/validate-payment/handler";
import { registerChargeCustomer } from "./processes/process-payment/topics/charge-customer/handler";
import { registerPrepareResponsePayment } from "./processes/process-payment/topics/prepare-response/handler";
import { registerHandleErrorPayment } from "./processes/process-payment/topics/handle-error/handler";

/**
 * Register all Camunda process topic subscriptions.
 */
export async function registerCamundaSubscriptions(
  app: FastifyInstance
): Promise<void> {
  // Onboard User Process
  registerValidateUserInformation(app);
  // ... other onboard-user registrations ...

  // Process Payment (New)
  registerValidatePayment(app);
  registerChargeCustomer(app);
  registerPrepareResponsePayment(app);
  registerHandleErrorPayment(app);

  app.log.info("All Camunda topic subscriptions registered");
}
```

## Step 6: Create BPMN Diagram

Create your Camunda BPMN diagram (using Camunda Modeler):

1. **Start Event**: Begin process
2. **Service Tasks**: One for each step
   - Set topic: `process-payment.validate-payment`
   - Set async before/after as needed
3. **End Event**: Complete process
4. **Error Boundary Events**: Route to error handler

Key properties for service tasks:

- **Type**: External
- **Topic**: Must match handler topic (`process-payment.validate-payment`)
- **Input/Output mappings**: Map variables
- **Retry time cycle**: Configure retry behavior

Deploy the BPMN to your Camunda instance.

## Step 7: Add Tests

Create `test/validate-payment.service.test.ts`:

```typescript
import { validatePaymentService } from "../src/camunda/processes/process-payment/topics/validate-payment/service";
import { BusinessRuleError } from "../src/lib/errors";

// Mock Fastify app
const mockApp = {
  db: {
    query: jest.fn(),
  },
} as any;

describe("validatePaymentService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("validates a valid payment", async () => {
    mockApp.db.query
      .mockResolvedValueOnce({ recordset: [{ id: "cust-123" }] }) // Customer lookup
      .mockResolvedValueOnce({ recordset: [{ id: "pm-456", is_valid: true }] }); // Payment method

    const result = await validatePaymentService(
      {
        amount: 100.5,
        currency: "USD",
        customerId: "cust-123",
        paymentMethodId: "pm-456",
      },
      { app: mockApp }
    );

    expect(result.isValid).toBe(true);
    expect(result.normalizedAmount).toBe(100.5);
  });

  it("rejects unsupported currency", async () => {
    await expect(
      validatePaymentService(
        {
          amount: 100,
          currency: "JPY",
          customerId: "cust-123",
          paymentMethodId: "pm-456",
        },
        { app: mockApp }
      )
    ).rejects.toThrow(BusinessRuleError);
  });

  it("rejects amount over limit", async () => {
    await expect(
      validatePaymentService(
        {
          amount: 15000,
          currency: "USD",
          customerId: "cust-123",
          paymentMethodId: "pm-456",
        },
        { app: mockApp }
      )
    ).rejects.toThrow("Payments over $10,000 require manual approval");
  });
});
```

Run tests:

```bash
pnpm test
```

See [Testing Guide](testing-guide.md) for more details.

## Step 8: Test End-to-End

Start your server and test the complete flow:

```bash
# Start server
pnpm run dev

# Start process
curl -X POST http://localhost:8080/api/process/start \
  -H "Content-Type: application/json" \
  -d '{
    "processKey": "process-payment",
    "correlationId": "payment-001",
    "variables": {
      "amount": 100.50,
      "currency": "USD",
      "customerId": "cust-123",
      "paymentMethodId": "pm-456"
    }
  }'

# Check status (if needed)
curl http://localhost:8080/api/process/status/payment-001
```

## Best Practices

### Schema Design

- Keep schemas focused and minimal
- Use Zod validation constraints (`.min()`, `.positive()`, etc.)
- Document complex fields with JSDoc comments
- Extract common schemas to shared files

### Service Design

- Services should be pure functions (no side effects on parameters)
- Access dependencies through `ctx.app`
- Use `BusinessRuleError` for expected failures
- Let unexpected errors propagate
- Add clear error messages
- Keep services under 100 lines

### Error Handling

- Validate early (schema validation catches most issues)
- Use `BusinessRuleError` for business rule violations
- Log before re-throwing errors
- Define BPMN error events for critical failures
- Test error paths thoroughly

### Naming Conventions

- Topics: `<process-key>.<step-name>`
- Files: kebab-case
- Functions: camelCase, descriptive verbs
- Types: PascalCase

## Common Patterns

### Calling External APIs

```typescript
import { httpService } from "../../../../../services/http.service";

export async function myService(input: InVars, ctx: { app: FastifyInstance }) {
  const response = await httpService({
    url: "https://api.example.com/endpoint",
    method: "POST",
    body: { data: input.someField },
    timeout: 5000,
    retries: 3,
  });

  return { apiResult: response };
}
```

### Database Queries

```typescript
const result = await ctx.app.db.query(
  "SELECT * FROM users WHERE id = @userId",
  [input.userId]
);

if (!result.recordset.length) {
  throw new BusinessRuleError("USER_NOT_FOUND", "User does not exist");
}

const user = result.recordset[0];
```

### Conditional Logic

```typescript
if (input.amount > 1000) {
  // High-value payment - require additional verification
  const verificationResult = await verifyHighValuePayment(input);
  return { requiresApproval: true, verificationId: verificationResult.id };
}

// Standard payment - process immediately
return { requiresApproval: false };
```

## Troubleshooting

### Topic Not Subscribed

**Error**: Camunda shows external task but nothing happens

**Solution**: Ensure handler is registered in `src/camunda/index.ts` and topic name matches BPMN diagram

### Schema Validation Fails

**Error**: `ZodError: Invalid input`

**Solution**: Check that BPMN output mappings match schema field names and types

### Process Doesn't Complete

**Error**: Status stays "pending" forever

**Solution**: Ensure final step calls `/api/process/complete` with correct correlationId

## Next Steps

- **[Testing Guide](testing-guide.md)**: Write comprehensive tests
- **[API Reference](../reference/api-endpoints.md)**: Understand all endpoints
- **[Error Handling](../reference/error-handling.md)**: Master error patterns
- **[Architecture Overview](../design/architecture-overview.md)**: Understand the system
