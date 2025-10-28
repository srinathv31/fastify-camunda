# Design Decisions

Architectural choices made in fastify-camunda, including rationale, trade-offs, and alternatives considered.

## Decision 1: Fastify over Express

**Decision**: Use Fastify as the web framework instead of Express.

### Rationale

- **Performance**: Fastify is significantly faster than Express (2-3x throughput)
- **Schema validation**: Built-in support for JSON schema validation
- **Plugin architecture**: Encapsulated, reusable plugins with dependency injection
- **TypeScript support**: First-class TypeScript support
- **Modern API**: Async/await throughout, no callback hell
- **Logging**: Pino logger built-in

### Trade-offs

**Pros**:

- Higher performance with same hardware
- Better developer experience with TypeScript
- Schema validation reduces boilerplate
- Plugin system encourages modular design

**Cons**:

- Smaller ecosystem than Express
- Less Stack Overflow answers
- Different middleware model (not fully Express-compatible)

### Alternatives Considered

- **Express**: More mature, larger ecosystem, but slower and less TypeScript-friendly
- **Koa**: Modern, but smaller ecosystem and less opinionated
- **NestJS**: Full framework, but heavy-weight for this use case

### Outcome

Fastify provides the best balance of performance, developer experience, and features needed for this application.

---

## Decision 2: In-Memory Map with Async Database Persistence

**Decision**: Use in-memory Map for process store with fire-and-forget database writes.

### Rationale

- **Speed**: Reading from Map is ~1000x faster than database (< 0.01ms vs 5-10ms)
- **Responsiveness**: Critical for sync/async pattern success
- **Eventual consistency**: Async writes provide durability without blocking
- **Simple**: No Redis dependency for single-instance deployment

### Trade-offs

**Pros**:

- Instant status access for waiting clients
- No database bottleneck on reads
- Simple to implement and test
- No additional infrastructure required

**Cons**:

- State lost on server restart (database has backup)
- Not suitable for multi-instance without Redis
- Memory usage grows with concurrent processes
- Eventual consistency (small window where Map and DB differ)

### Alternatives Considered

- **Database only**: Too slow for real-time responses
- **Redis only**: Requires additional infrastructure
- **Redis + Database**: Over-engineered for single instance

### Future Enhancement

For multi-instance deployments:

- Replace in-memory Map with Redis
- Minimal code changes (same interface)
- True horizontal scalability

### Outcome

In-memory first provides best user experience for single-instance deployment, with clear path to scaling.

---

## Decision 3: 25-Second Default Timeout

**Decision**: Default `SYNC_TIMEOUT_MS` to 25000 (25 seconds).

### Rationale

- **HTTP timeouts**: Most clients/proxies timeout at 30-60 seconds
- **User experience**: 25s feels "long but acceptable" for synchronous waits
- **Process duration**: Covers 80% of typical processes
- **Buffer**: Leaves 5s buffer before typical 30s HTTP timeout

### Trade-offs

**Pros**:

- Most processes complete within timeout (better UX)
- Reduces polling overhead
- Feels responsive to users

**Cons**:

- Holds connections open longer
- May exceed timeout for complex processes
- Resource usage (one connection per waiting process)

### Alternatives Considered

- **10 seconds**: Too short, most processes would timeout
- **60 seconds**: Risk of HTTP timeout, ties up connections
- **Configurable only**: Need good default for out-of-box experience

### Outcome

25 seconds is configurable via environment variable but provides good default for most use cases.

---

## Decision 4: Camunda External Task Pattern

**Decision**: Use External Task pattern instead of Java Delegates or Script Tasks.

### Rationale

- **Language flexibility**: Workers can be written in any language (we chose Node.js/TypeScript)
- **Decoupled**: Workers run separately from Camunda engine
- **Scalable**: Add more workers without modifying Camunda
- **Testable**: Workers can be tested independently
- **Resilient**: Worker failures don't crash Camunda

### Trade-offs

**Pros**:

- Flexibility in technology choices
- Independent deployment and scaling
- Better separation of concerns
- Easier to test and debug

**Cons**:

- Network calls between Camunda and workers (latency)
- Polling overhead
- More complex architecture
- Requires worker management

### Alternatives Considered

- **Java Delegates**: Tied to JVM, requires deploying code to Camunda
- **Script Tasks**: Limited capabilities, hard to test
- **DMN**: For decision logic only, not general tasks

### Outcome

External Task pattern provides best flexibility and maintainability for our tech stack.

---

## Decision 5: Zod for Schema Validation

**Decision**: Use Zod for runtime schema validation instead of JSON Schema or other libraries.

### Rationale

- **Type inference**: Zod schemas generate TypeScript types automatically
- **Runtime validation**: Validates data at runtime, not just compile-time
- **Composability**: Easy to compose and reuse schemas
- **Error messages**: Clear, structured error messages
- **Ecosystem**: Good TypeScript ecosystem support

### Trade-offs

**Pros**:

- Single source of truth for types and validation
- Excellent developer experience
- Type-safe throughout the application
- Detailed validation errors

**Cons**:

- Adds dependency
- Not as mature as JSON Schema
- Learning curve for team

### Alternatives Considered

- **JSON Schema**: Standard, but poor TypeScript integration
- **Joi**: Popular, but less TypeScript-friendly
- **TypeScript only**: No runtime validation
- **class-validator**: Requires classes, not plain objects

### Outcome

Zod provides best combination of type safety and developer experience for TypeScript applications.

---

## Decision 6: Single BPMN Error Code for All Errors

**Decision**: Map all errors to single `EMPLOYEE_CARD_ERROR` code for BPMN routing.

### Rationale

- **Simplicity**: Single error boundary event in BPMN
- **Centralized handling**: All errors route to one error handler
- **Error details**: Specific error types preserved in variables
- **Flexibility**: Can change error handling without changing BPMN

### Trade-offs

**Pros**:

- Simpler BPMN diagrams
- Easier to maintain
- Centralized error handling logic
- Error details still available

**Cons**:

- Can't route different errors to different handlers in BPMN
- Less expressive BPMN diagrams
- All errors look the same in Camunda Cockpit

### Alternatives Considered

- **Multiple error codes**: More expressive BPMN, but more complex
- **No BPMN errors**: Use variables only, but can't use error boundaries
- **Business vs Technical split**: Some complexity without much benefit

### Outcome

Single error code simplifies BPMN while preserving error details in variables. Can evolve to multiple codes if needed.

---

## Decision 7: Auto-Loading Routes

**Decision**: Use `@fastify/autoload` to automatically load routes from filesystem.

### Rationale

- **Convention over configuration**: Routes discovered by file structure
- **Scalability**: Easy to add new routes without modifying server.ts
- **Organization**: Clear file structure mirrors URL structure
- **Prefix support**: Apply prefix to all routes in directory

### Trade-offs

**Pros**:

- Less boilerplate in server.ts
- Clear organization
- Easy to add new routes
- Standard pattern in Fastify ecosystem

**Cons**:

- "Magic" (not obvious where routes come from)
- Requires specific file structure
- Debugging can be harder

### Alternatives Considered

- **Manual registration**: Explicit but verbose
- **Route index files**: Middle ground, still some boilerplate

### Outcome

Auto-loading provides best developer experience for route management as application grows.

---

## Decision 8: Fire-and-Forget Database Writes

**Decision**: Process store DB writes are fire-and-forget (async, not awaited).

### Rationale

- **Speed**: Don't block on database writes
- **Responsiveness**: Return to client immediately
- **Availability**: In-memory Map is source of truth
- **Durability**: Database provides backup, not primary storage

### Trade-offs

**Pros**:

- Faster responses
- Better user experience
- No database bottleneck
- High throughput

**Cons**:

- Small window where Map and DB differ
- DB write failures are logged but don't fail request
- Eventual consistency

### Alternatives Considered

- **Await DB writes**: Simpler, but slower and database becomes bottleneck
- **Write-through cache**: More complex, not needed for this use case
- **Message queue**: Over-engineered for this scenario

### Outcome

Fire-and-forget provides best performance while maintaining durability through async writes.

---

## Decision 9: TypeScript Throughout

**Decision**: Use TypeScript for entire application.

### Rationale

- **Type safety**: Catch errors at compile-time
- **Developer experience**: Auto-completion, refactoring support
- **Documentation**: Types serve as inline documentation
- **Maintainability**: Easier to understand and modify code
- **Ecosystem**: Great TypeScript support in Node.js ecosystem

### Trade-offs

**Pros**:

- Fewer runtime errors
- Better IDE support
- Easier onboarding for new developers
- Self-documenting code

**Cons**:

- Build step required
- Slightly slower development (type errors)
- Additional dependency (TypeScript compiler)

### Alternatives Considered

- **JavaScript**: Faster iteration, but less safe
- **JavaScript with JSDoc**: Middle ground, but less powerful

### Outcome

TypeScript's benefits far outweigh the minimal overhead for a production application.

---

## Decision 10: Pino for Logging

**Decision**: Use Pino for structured logging.

### Rationale

- **Performance**: Pino is fastest Node.js logger
- **Structured**: JSON logs easy to parse and query
- **Ecosystem**: Good Fastify integration
- **Redaction**: Built-in sensitive data removal
- **Pretty printing**: Development-friendly output

### Trade-offs

**Pros**:

- Fast (low overhead)
- Structured logs (machine-readable)
- Good developer experience
- Production-ready features

**Cons**:

- JSON logs less human-readable in production
- Requires log aggregation for best value

### Alternatives Considered

- **Winston**: More features, but slower
- **Bunyan**: Similar to Pino, less maintained
- **Console.log**: Simple, but not production-ready

### Outcome

Pino provides best performance and features for production logging.

---

## Decision 11: Process Cleanup Delay (5 seconds)

**Decision**: Keep completed processes in memory for 5 seconds before removal.

### Rationale

- **Race condition**: Client may poll immediately after completion
- **Cache**: Allows one more status check without database hit
- **Buffer**: Small window for final status retrieval
- **Memory**: 5 seconds is short enough to not accumulate

### Trade-offs

**Pros**:

- Prevents "not found" on immediate status check
- Better user experience
- Minimal memory impact

**Cons**:

- Memory usage slightly higher
- Cleanup complexity

### Alternatives Considered

- **Immediate removal**: Cleaner, but race conditions
- **Longer delay (30s+)**: More memory usage
- **No removal**: Memory leak

### Outcome

5 seconds provides good balance between memory usage and user experience.

---

## Decision 12: Correlation ID as Business Key

**Decision**: Use client-provided correlation ID as both identifier and Camunda business key.

### Rationale

- **Client control**: Client can track their own processes
- **Idempotency**: Same correlation ID can be reused (or rejected)
- **Simplicity**: One identifier for everything
- **Debugging**: Easy to trace across systems

### Trade-offs

**Pros**:

- Simple to understand and use
- Client has control
- Easy to correlate with external systems

**Cons**:

- Clients must generate unique IDs
- No automatic UUID generation

### Alternatives Considered

- **Server-generated UUID**: Simpler for client, but harder to track
- **Separate business key**: More flexibility, more complexity

### Outcome

Client-provided correlation ID provides best balance of simplicity and control.

---

## Summary

These design decisions prioritize:

1. **Performance**: Fast responses critical for sync/async pattern
2. **Developer Experience**: TypeScript, Zod, Fastify improve productivity
3. **Simplicity**: Avoid over-engineering, use right tool for the job
4. **Scalability**: Design allows future enhancements (Redis, multiple instances)
5. **Maintainability**: Clear structure, type safety, good logging

## Evolution Path

Current design supports single-instance deployment. For scaling:

1. Replace in-memory Map with Redis
2. Add load balancer with health checks
3. Add metrics and monitoring
4. Consider Kubernetes for orchestration
5. Add authentication and authorization

See [Architecture Overview](architecture-overview.md) for scalability considerations.

## Related Documentation

- [Architecture Overview](architecture-overview.md): System design
- [Callback Strategy](callback-strategy.md): Sync/async pattern
- [Data Model](data-model.md): Database and in-memory structures
