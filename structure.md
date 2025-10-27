fastify-camunda/
├─ src/
│ ├─ server.ts # main app setup with autoload
│ ├─ start.ts # entry point for production
│ ├─ plugins/
│ │ ├─ camunda-client.ts
│ │ ├─ db.ts
│ │ ├─ env.ts
│ │ ├─ event-log.ts
│ │ ├─ logger.ts
│ │ └─ process-store.ts # NEW: in-memory Map + async DB persistence
│ ├─ camunda/
│ │ ├─ index.ts # register all process/topic subscribers
│ │ └─ processes/
│ │ └─ onboard-user/ # example process
│ │ ├─ topics/
│ │ │ ├─ validate-user-information/
│ │ │ │ ├─ handler.ts # subscribe('validate-user-information', …)
│ │ │ │ ├─ schema.ts # zod in/out vars
│ │ │ │ └─ service.ts # business logic for this step
│ │ │ ├─ run-background-check/
│ │ │ │ ├─ handler.ts
│ │ │ │ ├─ schema.ts
│ │ │ │ └─ service.ts
│ │ │ ├─ call-onboarding-api/
│ │ │ │ ├─ handler.ts
│ │ │ │ ├─ schema.ts
│ │ │ │ └─ service.ts
│ │ │ └─ prepare-response/ # NEW: final task
│ │ │ ├─ handler.ts
│ │ │ ├─ schema.ts
│ │ │ └─ service.ts
│ │ └─ shared.ts # step definitions for this process
│ ├─ services/ # reusable domain helpers across processes
│ │ ├─ http.service.ts # got/undici wrapper (timeouts, retry, jitter)
│ │ ├─ mssql.service.ts
│ │ └─ camunda-rest.service.ts # NEW: Camunda REST API client
│ ├─ repositories/ # DB access & event logging
│ │ ├─ user.repo.ts
│ │ ├─ event-log.repo.ts
│ │ └─ process-store.repo.ts # NEW: process store DB operations
│ ├─ lib/
│ │ ├─ camunda.ts # readVars/completeWith/handle errors
│ │ ├─ errors.ts # BusinessRuleError, etc.
│ │ ├─ subscribeTopic.ts # generic subscription wrapper
│ │ ├─ util.ts
│ │ ├─ waitroom.ts # NEW: Promise-based waiting pattern
│ │ └─ process-store.ts # NEW: in-memory Map interface
│ └─ routes/ # NEW: REST API routes (auto-loaded)
│ └─ process/
│ ├─ start.ts # POST /api/process/start
│ ├─ status.ts # GET /api/process/status/:id & /all
│ └─ complete.ts # POST /api/process/complete
└─ test/… # unit tests for service.ts & handler.ts
