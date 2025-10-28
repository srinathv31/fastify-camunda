# Configuration Reference

Complete reference for all environment variables and configuration options in fastify-camunda.

## Environment Variables

All configuration is loaded from environment variables and validated by the `env` plugin (`src/plugins/env.ts`).

### Quick Reference

| Variable                            | Type         | Default                             | Required | Description               |
| ----------------------------------- | ------------ | ----------------------------------- | -------- | ------------------------- |
| `NODE_ENV`                          | string       | `development`                       | No       | Environment mode          |
| `PORT`                              | number       | -                                   | No       | Server port               |
| `CAMUNDA_BASE_URL`                  | string (URL) | `http://localhost:8080/engine-rest` | No       | Camunda REST API endpoint |
| `CAMUNDA_MAX_TASKS`                 | number       | `10`                                | No       | Max tasks per poll        |
| `CAMUNDA_LOCK_DURATION_MS`          | number       | `20000`                             | No       | Task lock duration        |
| `CAMUNDA_ASYNC_RESPONSE_TIMEOUT_MS` | number       | `30000`                             | No       | Long polling timeout      |
| `SYNC_TIMEOUT_MS`                   | number       | `25000`                             | No       | Process wait timeout      |
| `DB_HOST`                           | string       | -                                   | No\*     | Database server           |
| `DB_NAME`                           | string       | -                                   | No\*     | Database name             |
| `DB_USER`                           | string       | -                                   | No\*     | Database username         |
| `DB_PASSWORD`                       | string       | -                                   | No\*     | Database password         |
| `LOG_LEVEL`                         | string       | `info` / `debug`                    | No       | Logging level             |

\* Required for database operations

---

## Application Configuration

### NODE_ENV

**Type**: `"development" | "test" | "production"`  
**Default**: `"development"`  
**Required**: No

Controls application behavior:

- **development**: Pretty logs, verbose errors, hot reload
- **test**: Minimal logs, mock external services
- **production**: JSON logs, optimized performance, error sanitization

**Example**:

```bash
NODE_ENV=production
```

**Impact**:

- Log format (pretty vs JSON)
- Log level default (debug vs info)
- Error detail exposure
- Performance optimizations

---

### PORT

**Type**: `number`  
**Default**: None (defaults to Fastify's default 3000)  
**Required**: No

Port for the Fastify server to listen on.

**Example**:

```bash
PORT=8080
```

**Usage**:

```typescript
await app.listen({ port: app.config.PORT || 3000, host: "0.0.0.0" });
```

---

## Camunda Configuration

### CAMUNDA_BASE_URL

**Type**: `string` (URL format)  
**Default**: `http://localhost:8080/engine-rest`  
**Required**: No

Base URL for the Camunda REST API.

**Example**:

```bash
CAMUNDA_BASE_URL=https://camunda.example.com/engine-rest
```

**Usage**:

- Starting process instances
- External task polling
- Process deployment

**Format**: Must be a valid URL including protocol

---

### CAMUNDA_MAX_TASKS

**Type**: `number`  
**Default**: `10`  
**Required**: No

Maximum number of tasks to fetch in a single poll.

**Example**:

```bash
CAMUNDA_MAX_TASKS=20
```

**Considerations**:

- **Higher value**: Processes more tasks simultaneously, higher throughput
- **Lower value**: More granular control, lower memory usage
- **Recommended**: 10-20 for most workloads

**Impact**: Controls concurrency of task processing

---

### CAMUNDA_LOCK_DURATION_MS

**Type**: `number` (milliseconds)  
**Default**: `20000` (20 seconds)  
**Required**: No

How long to lock external tasks when fetched.

**Example**:

```bash
CAMUNDA_LOCK_DURATION_MS=30000
```

**Considerations**:

- Must be longer than expected task execution time
- If task takes longer, lock expires and Camunda may reassign
- Balance between too short (premature expiry) and too long (delayed retry)
- **Recommended**: 20000-60000 depending on task complexity

---

### CAMUNDA_ASYNC_RESPONSE_TIMEOUT_MS

**Type**: `number` (milliseconds)  
**Default**: `30000` (30 seconds)  
**Required**: No

Timeout for long polling when fetching external tasks.

**Example**:

```bash
CAMUNDA_ASYNC_RESPONSE_TIMEOUT_MS=45000
```

**Considerations**:

- How long worker waits for tasks before polling again
- Higher value: Less polling overhead
- Lower value: More responsive to new tasks
- **Recommended**: 30000-60000

---

### SYNC_TIMEOUT_MS

**Type**: `number` (milliseconds)  
**Default**: `25000` (25 seconds)  
**Required**: No

How long to wait for process completion before returning 202 Accepted.

**Example**:

```bash
SYNC_TIMEOUT_MS=30000
```

**Considerations**:

- Balance between immediate responses and 202 polling
- Should be shorter than typical HTTP client timeouts (30-60s)
- Consider average process duration
- **Fast processes (< 5s)**: Keep at 25000 for best UX
- **Slow processes (> 30s)**: Consider lowering to 10000-15000

**Impact**:

- Higher: More processes complete synchronously (200), fewer polling requests
- Lower: More 202 responses, more status polling overhead

---

## Database Configuration

### DB_HOST

**Type**: `string`  
**Default**: None  
**Required**: Yes (for database operations)

Database server hostname or IP address.

**Examples**:

```bash
# Local
DB_HOST=localhost

# Cloud
DB_HOST=mydb.database.windows.net

# IP address
DB_HOST=192.168.1.100
```

---

### DB_NAME

**Type**: `string`  
**Default**: None  
**Required**: Yes (for database operations)

Database name.

**Example**:

```bash
DB_NAME=camunda_prod
```

---

### DB_USER

**Type**: `string`  
**Default**: None  
**Required**: Yes (for database operations)

Database username.

**Example**:

```bash
DB_USER=camunda_user
```

**Security**: Use dedicated service account, not admin

---

### DB_PASSWORD

**Type**: `string`  
**Default**: None  
**Required**: Yes (for database operations)

Database password.

**Example**:

```bash
DB_PASSWORD=SecurePassword123!
```

**Security**:

- Never commit to version control
- Use environment-specific secrets
- Rotate regularly
- Use strong passwords
- Consider secrets management (AWS Secrets Manager, Azure Key Vault, etc.)

---

## Logging Configuration

### LOG_LEVEL

**Type**: `string`  
**Default**: `"debug"` (development) / `"info"` (production)  
**Required**: No

Logging verbosity level.

**Values**: `"trace" | "debug" | "info" | "warn" | "error" | "fatal"`

**Example**:

```bash
LOG_LEVEL=debug
```

**Levels**:

- **trace** (10): Very detailed debugging
- **debug** (20): Debugging information
- **info** (30): General information (default production)
- **warn** (40): Warnings
- **error** (50): Errors requiring attention
- **fatal** (60): Critical failures

**Recommendations**:

- **Development**: `debug` or `trace`
- **Staging**: `info`
- **Production**: `info` or `warn`

---

## Environment File Examples

### Development (.env.development)

```bash
NODE_ENV=development
PORT=8080

# Local Camunda
CAMUNDA_BASE_URL=http://localhost:8080/engine-rest
CAMUNDA_MAX_TASKS=5
CAMUNDA_LOCK_DURATION_MS=20000
CAMUNDA_ASYNC_RESPONSE_TIMEOUT_MS=30000

# Sync timeout
SYNC_TIMEOUT_MS=25000

# Local database
DB_HOST=localhost
DB_NAME=camunda_dev
DB_USER=dev_user
DB_PASSWORD=dev_password

# Verbose logging
LOG_LEVEL=debug
```

### Production (.env.production)

```bash
NODE_ENV=production
PORT=8080

# Production Camunda
CAMUNDA_BASE_URL=https://camunda.company.com/engine-rest
CAMUNDA_MAX_TASKS=20
CAMUNDA_LOCK_DURATION_MS=30000
CAMUNDA_ASYNC_RESPONSE_TIMEOUT_MS=45000

# Sync timeout
SYNC_TIMEOUT_MS=25000

# Production database
DB_HOST=db-prod.company.com
DB_NAME=camunda_prod
DB_USER=camunda_svc
DB_PASSWORD=${DB_PASSWORD_FROM_SECRETS}

# Production logging
LOG_LEVEL=info
```

### Docker Compose (.env.docker)

```bash
NODE_ENV=development
PORT=8080

# Docker Camunda service
CAMUNDA_BASE_URL=http://camunda:8080/engine-rest
CAMUNDA_MAX_TASKS=10
CAMUNDA_LOCK_DURATION_MS=20000
CAMUNDA_ASYNC_RESPONSE_TIMEOUT_MS=30000
SYNC_TIMEOUT_MS=25000

# Docker database service
DB_HOST=mssql
DB_NAME=camunda
DB_USER=sa
DB_PASSWORD=YourStrong@Passw0rd

LOG_LEVEL=debug
```

---

## Validation

Environment variables are validated at startup using Zod schemas in `src/plugins/env.ts`.

### Validation Rules

- **NODE_ENV**: Must be `"development"`, `"test"`, or `"production"`
- **PORT**: Must be a number (coerced from string)
- **CAMUNDA_BASE_URL**: Must be a valid URL
- **CAMUNDA_MAX_TASKS**: Must be a number
- **CAMUNDA_LOCK_DURATION_MS**: Must be a number
- **CAMUNDA_ASYNC_RESPONSE_TIMEOUT_MS**: Must be a number
- **SYNC_TIMEOUT_MS**: Must be a number
- **DB\_\***: Must be strings

### Validation Errors

If validation fails, the application logs detailed errors and exits:

```
{
  "level": 50,
  "msg": "Invalid environment variables",
  "issues": [
    {
      "code": "invalid_type",
      "expected": "number",
      "received": "string",
      "path": ["PORT"],
      "message": "Expected number, received string"
    }
  ]
}
ERROR: ENV_VALIDATION_FAILED
```

---

## Runtime Access

Access configuration throughout the application:

```typescript
// In route handlers
app.get("/config", async (req, reply) => {
  return {
    nodeEnv: app.config.NODE_ENV,
    syncTimeout: app.config.SYNC_TIMEOUT_MS,
  };
});

// In services
export async function myService(input: InVars, ctx: { app: FastifyInstance }) {
  const timeout = ctx.app.config.SYNC_TIMEOUT_MS;
  // ...
}

// In plugins
export default fp(async (app) => {
  const camundaUrl = app.config.CAMUNDA_BASE_URL;
  // ...
});
```

---

## Best Practices

### Security

- ✅ Use environment-specific files (.env.development, .env.production)
- ✅ Never commit .env files to version control
- ✅ Add .env\* to .gitignore
- ✅ Use secrets management in production
- ✅ Rotate passwords regularly
- ✅ Use least-privilege database accounts
- ✅ Encrypt sensitive data at rest

### Organization

- ✅ Create .env.example with dummy values
- ✅ Document all variables in README
- ✅ Group related variables together
- ✅ Use consistent naming (SCREAMING_SNAKE_CASE)
- ✅ Provide sensible defaults when possible

### Testing

- ✅ Use separate database for tests
- ✅ Mock external services in tests
- ✅ Set LOG_LEVEL=error in tests for clean output
- ✅ Override config in test setup

Example test setup:

```typescript
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "error";
process.env.DB_HOST = "localhost";
process.env.DB_NAME = "camunda_test";
```

---

## Troubleshooting

### Common Issues

**Error**: `ENV_VALIDATION_FAILED`  
**Cause**: Invalid or missing environment variable  
**Solution**: Check validation error details, fix .env file

**Error**: `ConnectionError: Failed to connect to database`  
**Cause**: Invalid DB\_\* variables  
**Solution**: Verify database credentials and connectivity

**Error**: `ECONNREFUSED connecting to Camunda`  
**Cause**: Invalid CAMUNDA_BASE_URL or Camunda not running  
**Solution**: Check URL and verify Camunda is accessible

### Debugging Configuration

```typescript
// Log configuration at startup
app.log.info(
  {
    nodeEnv: app.config.NODE_ENV,
    camundaUrl: app.config.CAMUNDA_BASE_URL,
    syncTimeout: app.config.SYNC_TIMEOUT_MS,
  },
  "Application configuration"
);
```

---

## Related Documentation

- [Plugins Reference](plugins.md): env plugin details
- [Deployment Guide](../guides/deployment.md): Production configuration
- [Getting Started](../guides/getting-started.md): Initial setup
