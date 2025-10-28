# Architecture Overview

High-level system architecture and design of fastify-camunda, a Camunda worker service with sync/async REST API pattern.

## System Purpose

fastify-camunda bridges synchronous REST APIs and asynchronous workflow engines, enabling:

1. **External clients** to start Camunda processes via REST API
2. **Immediate responses** for fast processes (< 25s)
3. **Asynchronous polling** for longer processes
4. **Workflow orchestration** using Camunda BPMN
5. **Audit trail** for all process steps

## High-Level Architecture

```
┌─────────────────┐
│  External       │
│  Clients        │
│  (REST API)     │
└────────┬────────┘
         │ HTTP
         ↓
┌─────────────────────────────────────────────────────────┐
│                  Fastify Application                      │
│  ┌────────────┐  ┌──────────┐  ┌─────────────────────┐ │
│  │  REST API  │  │ Waitroom │  │  Process Store      │ │
│  │  Routes    │  │ (in-mem) │  │  (Map + DB)         │ │
│  └────────────┘  └──────────┘  └─────────────────────┘ │
│                                                           │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Camunda External Task Workers                     │ │
│  │  (subscribeTopic wrappers)                         │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────┬────────────────────────┬──────────────────┘
              │                        │
              │ External Task Protocol │ SQL
              ↓                        ↓
     ┌─────────────────┐      ┌──────────────┐
     │  Camunda        │      │  MSSQL       │
     │  Engine         │      │  Database    │
     │  (BPMN)         │      │              │
     └─────────────────┘      └──────────────┘
```

## Core Components

### 1. Fastify Server

**Purpose**: HTTP server and dependency injection container

**Responsibilities**:

- Serve REST API endpoints
- Register plugins for shared services
- Auto-load routes from filesystem
- Manage application lifecycle

**Technology**: [Fastify](https://fastify.dev/) - high-performance web framework

**Key Files**:

- `src/server.ts` - Application setup and plugin registration
- `src/start.ts` - Entry point that starts the server

### 2. REST API Routes

**Purpose**: External client interface for starting and monitoring processes

**Endpoints**:

- `POST /api/process/start` - Start process, wait or return 202
- `GET /api/process/status/:correlationId` - Get process status
- `GET /api/process/status/all` - List all active processes
- `POST /api/process/complete` - Complete process (called by final task)

**Location**: `src/routes/process/`

**Design Pattern**: Auto-loaded via `@fastify/autoload`

### 3. Waitroom

**Purpose**: Track pending promises for clients waiting for process completion

**Implementation**: In-memory Map of promises with timeouts

**Key Operations**:

- `createWait()` - Create promise that waits for completion
- `completeWait()` - Resolve promise with result
- `failWait()` - Reject promise with error
- `clearAll()` - Cleanup on shutdown

**Location**: `src/lib/waitroom.ts`

**Characteristics**:

- Fast (in-memory)
- Ephemeral (cleared on restart)
- Timeout-based (default 25s)

### 4. Process Store

**Purpose**: Track process state with fast reads and durable writes

**Implementation**: Dual storage

- **In-memory Map**: Immediate access
- **Database table**: Persistent storage

**Key Operations**:

- `save()` - Update Map immediately, DB async
- `get()` - Read from Map, fallback to DB
- `remove()` - Delete from Map (DB persists)
- `values()` - Get all active processes

**Location**: `src/lib/process-store.ts`, `src/plugins/process-store.ts`

**Design Rationale**: Speed + Durability (see [Design Decisions](design-decisions.md))

### 5. Camunda External Task Workers

**Purpose**: Execute BPMN service tasks as external workers

**Implementation**: Poll-based workers using Camunda External Task Client

**Flow**:

1. Poll Camunda for tasks with specific topic
2. Fetch task and lock it
3. Execute handler (validate, call service, complete)
4. Return result or error to Camunda
5. Camunda proceeds to next task

**Key Components**:

- **subscribeTopic wrapper**: Generic handler with automatic event logging
- **Topic handlers**: Register subscriptions for each step
- **Services**: Business logic for each step
- **Schemas**: Zod validation for input/output variables

**Location**: `src/camunda/`, `src/lib/subscribe-topic.ts`

### 6. Event Logging

**Purpose**: Audit trail for all process steps

**Implementation**: Database table with structured event records

**Logged Data**:

- Correlation ID, step name, status
- Request/response data
- HTTP method and endpoint
- Error messages
- Execution time
- Traceability IDs

**Location**: `src/plugins/event-log.ts`, `src/repositories/event-log.repo.ts`

**Benefits**: Debugging, compliance, analytics, monitoring

### 7. Database Layer

**Purpose**: Persistent storage for process state and events

**Technology**: Microsoft SQL Server (MSSQL)

**Tables**:

- `process_store` - Process state (status, data, error)
- `event_log` - Audit trail for all steps

**Access Pattern**: Repository pattern with connection pooling

**Location**: `src/plugins/db.ts`, `src/repositories/`

### 8. Camunda Engine

**Purpose**: Workflow orchestration using BPMN

**Responsibilities**:

- Execute BPMN process definitions
- Create external tasks
- Handle BPMN errors and routing
- Manage process state and history

**Integration**: External Task pattern (polling)

**Not Part of Repository**: Assumed to be deployed separately

## Data Flow

### Starting a Process

```
1. Client → POST /api/process/start
   ↓
2. API validates request
   ↓
3. Process Store saves status=pending
   ↓
4. Waitroom creates wait promise
   ↓
5. Camunda REST API called (start process)
   ↓
6. Wait for completion or timeout
   ├─ Completed → 200 with result
   └─ Timeout → 202 with statusUrl
```

### Executing a Task

```
1. Camunda creates external task
   ↓
2. Worker polls and fetches task
   ↓
3. subscribeTopic extracts variables
   ↓
4. Schema validates input
   ↓
5. Service executes business logic
   ↓
6. Task completed with output variables
   ↓
7. Event logged to database
   ↓
8. Camunda proceeds to next task
```

### Completing a Process

```
1. Final task → POST /api/process/complete
   ↓
2. Process Store updates status=ok/error
   ↓
3. Waitroom resolves/rejects promise
   ↓
4. Waiting client receives response (if any)
   ↓
5. Process removed from Map after 5s
   ↓
6. Database retains historical data
```

## Technology Stack

| Component       | Technology                      | Purpose                           |
| --------------- | ------------------------------- | --------------------------------- |
| Web Framework   | Fastify 4                       | HTTP server, plugins              |
| Language        | TypeScript                      | Type safety, developer experience |
| Workflow Engine | Camunda Platform 7              | BPMN orchestration                |
| Camunda Client  | camunda-external-task-client-js | External task polling             |
| Database        | Microsoft SQL Server            | Persistent storage                |
| Database Client | mssql                           | Node.js MSSQL driver              |
| Validation      | Zod                             | Runtime schema validation         |
| Logging         | Pino                            | Structured JSON logging           |
| Testing         | Jest                            | Unit and integration tests        |
| Process Manager | PM2 (optional)                  | Production deployment             |

## Scalability Considerations

### Current Design

**Single Instance**:

- Waitroom is instance-local (in-memory Map)
- Process Store Map is instance-local
- Workers poll Camunda independently

**Implications**:

- Waiting clients must hit same instance (sticky sessions)
- Horizontal scaling limited without shared state

### Future Enhancements

**Multi-Instance with Redis**:

- Replace in-memory Map with Redis
- Shared waitroom across instances
- Shared process store cache
- True horizontal scalability

**Load Distribution**:

- Multiple worker instances poll Camunda
- Camunda distributes tasks across workers
- Database handles concurrent writes
- Event log provides single source of truth

### Current Capacity

Single instance can handle:

- **Concurrent processes**: 100-1000 (depends on memory)
- **Requests/sec**: 100+ (Fastify is fast)
- **Worker throughput**: Depends on task complexity and `CAMUNDA_MAX_TASKS`

Bottlenecks:

- Memory (waitroom + process store Map)
- Database connections
- Camunda task lock availability

## Security Considerations

### Current State

- No authentication on REST API
- No authorization checks
- Database credentials in environment variables
- No input sanitization beyond Zod validation

### Production Requirements

Add:

- **API Authentication**: JWT tokens, API keys, OAuth
- **Authorization**: Role-based access control
- **Rate Limiting**: Prevent abuse
- **TLS/HTTPS**: Encrypt traffic
- **Secrets Management**: Vault, AWS Secrets Manager
- **Input Validation**: Sanitize all inputs
- **SQL Injection Prevention**: Parameterized queries (already in place)
- **CORS Configuration**: Whitelist allowed origins

## Monitoring and Observability

### Logging

- **Structured logs**: JSON format (Pino)
- **Log levels**: Debug, info, warn, error, fatal
- **Request logging**: Automatic Fastify logging
- **Error logging**: Automatic in subscribeTopic wrapper

### Metrics (Future)

- Process start rate
- Process completion rate
- Success/error ratio
- Average execution time
- Waitroom size
- Database connection pool usage

### Tracing

- Correlation ID tracks process end-to-end
- Batch ID, traceability ID, application ID for context
- Event log provides step-by-step audit trail

## Integration Points

### Camunda

**Protocol**: REST API (polling)
**Direction**: Bidirectional

- Outbound: Start process instances
- Inbound: Poll for external tasks

**Configuration**: `CAMUNDA_BASE_URL`

### Database

**Protocol**: TDS (SQL Server protocol)
**Direction**: Bidirectional (read/write)

**Configuration**: `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`

### External APIs (in process steps)

**Protocol**: HTTP/HTTPS
**Direction**: Outbound
**Examples**: Payment gateways, email services, third-party APIs

**Implementation**: `httpService` wrapper with timeout/retry

## Deployment Architecture

### Typical Setup

```
                  ┌──────────────┐
                  │ Load Balancer│
                  └──────┬───────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
    ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐
    │ fastify-  │  │ fastify-  │  │ fastify-  │
    │ camunda-1 │  │ camunda-2 │  │ camunda-3 │
    └─────┬─────┘  └─────┬─────┘  └─────┬─────┘
          │              │              │
          └──────────────┼──────────────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
    ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐
    │  Camunda  │  │   MSSQL   │  │   Redis   │
    │  Engine   │  │ Database  │  │  (Future) │
    └───────────┘  └───────────┘  └───────────┘
```

### Container-Based (Docker/Kubernetes)

- Each component in separate container
- Orchestration with Kubernetes
- Auto-scaling based on load
- Health checks and liveness probes

See [Deployment Guide](../guides/deployment.md) for details.

## Related Documentation

- [Callback Strategy](callback-strategy.md): Sync/async pattern implementation
- [Process Lifecycle](process-lifecycle.md): Complete process flow
- [Data Model](data-model.md): Database and in-memory structures
- [Design Decisions](design-decisions.md): Architectural choices and trade-offs
