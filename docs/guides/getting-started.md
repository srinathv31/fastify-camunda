# Getting Started

This guide walks you through setting up and running fastify-camunda on your local machine.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js 18 or higher**: Download from [nodejs.org](https://nodejs.org/)
- **pnpm**: Install with `npm install -g pnpm` (or use npm/yarn)
- **Microsoft SQL Server**: You need access to an MSSQL database
  - Local installation, Docker container, or cloud instance
  - Database user with read/write permissions
- **Camunda Platform 7** (optional for initial testing):
  - Can run in mock mode initially
  - For full integration, install [Camunda Platform](https://camunda.com/download/)

Verify your installations:

```bash
node --version  # Should show v18 or higher
pnpm --version  # Should show 8.0 or higher
```

## Installation

### Clone and Install Dependencies

```bash
# Clone the repository
git clone <repository-url>
cd fastify-camunda

# Install dependencies
pnpm install
```

This installs all required packages including Fastify, the Camunda client, database drivers, and testing tools.

### Database Setup

Create the required database tables:

```sql
-- Event log table for audit trail
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
  created_at DATETIME2 DEFAULT GETDATE(),
  INDEX idx_correlation_id (correlation_id)
);

-- Process store table for process state
CREATE TABLE process_store (
  correlation_id VARCHAR(255) PRIMARY KEY,
  status VARCHAR(50) NOT NULL,
  data NVARCHAR(MAX),
  error NVARCHAR(MAX),
  started_at DATETIME2 NOT NULL,
  updated_at DATETIME2 NOT NULL
);
```

You can find these queries in `docs/reference/repositories.md`.

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```bash
# Node environment
NODE_ENV=development

# Server configuration
PORT=8080

# Camunda configuration
CAMUNDA_BASE_URL=http://localhost:8080/engine-rest
CAMUNDA_MAX_TASKS=10
CAMUNDA_LOCK_DURATION_MS=20000
CAMUNDA_ASYNC_RESPONSE_TIMEOUT_MS=30000

# Sync/async timeout (how long to wait before returning 202)
SYNC_TIMEOUT_MS=25000

# Database configuration
DB_HOST=localhost
DB_NAME=camunda_db
DB_USER=your_username
DB_PASSWORD=your_password
```

### Configuration Details

- **CAMUNDA_BASE_URL**: Camunda REST API endpoint
- **SYNC_TIMEOUT_MS**: How long to wait for process completion before returning 202 Accepted (default: 25 seconds)
- **CAMUNDA_LOCK_DURATION_MS**: How long to lock external tasks (default: 20 seconds)
- **DB\_\***: Database connection parameters

See [Configuration Reference](../reference/configuration.md) for complete details.

## Build and Run

### Development Mode

Run with hot reload enabled:

```bash
pnpm run dev
```

This uses nodemon to automatically restart the server when you make changes.

### Production Build

Compile TypeScript to JavaScript:

```bash
# Build
pnpm run build

# Run production server
pnpm start
```

The compiled output is in the `dist/` directory.

### Verify Installation

Check that the server is running:

```bash
# In another terminal
curl http://localhost:8080/ping
# Should return: "pong"
```

## Running Your First Process

### Start a Process

The example onboard-user process is included. Start it with:

```bash
curl -X POST http://localhost:8080/api/process/start \
  -H "Content-Type: application/json" \
  -d '{
    "processKey": "onboard-user",
    "correlationId": "user-001",
    "variables": {
      "userId": "user-001",
      "email": "john.doe@example.com"
    }
  }'
```

### Understanding the Response

You'll receive one of two responses:

**If process completes within 25 seconds (200 OK):**

```json
{
  "status": "ok",
  "correlationId": "user-001",
  "result": {
    "validationResult": {...},
    "backgroundCheckResult": {...},
    "onboardingResult": {...}
  }
}
```

**If process takes longer than 25 seconds (202 Accepted):**

```json
{
  "status": "pending",
  "correlationId": "user-001",
  "statusUrl": "/api/process/status/user-001"
}
```

### Check Process Status

If you received a 202 response, poll for completion:

```bash
curl http://localhost:8080/api/process/status/user-001
```

This returns the current process status:

```json
{
  "status": "ok",
  "correlationId": "user-001",
  "data": {...},
  "startedAt": "2025-10-28T10:30:00.000Z",
  "updatedAt": "2025-10-28T10:30:15.000Z"
}
```

Status codes:

- **200**: Process completed successfully
- **202**: Process still running
- **404**: Process not found
- **500**: Process failed with error

### View All Processes

For debugging, list all processes:

```bash
curl http://localhost:8080/api/process/status/all
```

## Running Tests

Verify your installation by running the test suite:

```bash
# Run all tests
pnpm test

# Run with coverage report
pnpm test:cov
```

All tests should pass. Coverage report is generated in the `coverage/` directory.

## Common Issues

### Database Connection Fails

**Error**: `ConnectionError: Failed to connect to localhost:1433`

**Solution**: Verify database is running and credentials are correct:

- Check `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` in `.env`
- Test connection using SQL client
- Ensure SQL Server allows TCP/IP connections

### Camunda Connection Fails

**Error**: `Error: connect ECONNREFUSED 127.0.0.1:8080`

**Solution**: If Camunda is not running:

- Process start requests will fail
- External task workers will log connection errors
- Consider running Camunda in Docker:

```bash
docker run -d --name camunda -p 8080:8080 camunda/camunda-bpm-platform:latest
```

### Port Already in Use

**Error**: `EADDRINUSE: address already in use :::8080`

**Solution**: Change the port in `.env`:

```bash
PORT=3000
```

## Next Steps

Now that you have fastify-camunda running:

1. **[Understanding the System](understanding-the-system.md)**: Learn how the callback pattern works
2. **[Creating a Process](creating-a-process.md)**: Build your own workflow
3. **[API Reference](../reference/api-endpoints.md)**: Explore all available endpoints
4. **[Testing Guide](testing-guide.md)**: Write tests for your processes

## Additional Resources

- [Fastify Documentation](https://fastify.dev/)
- [Camunda External Task Pattern](https://docs.camunda.org/manual/7.19/user-guide/process-engine/external-tasks/)
- [Zod Schema Validation](https://zod.dev/)
