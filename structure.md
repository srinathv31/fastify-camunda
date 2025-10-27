fastify-camunda/
├─ src/
│ ├─ server.ts
│ ├─ plugins/
│ │ └─ camunda-client.ts
│ ├─ camunda/
│ │ ├─ index.ts # register all process/topic subscribers
│ │ └─ processes/
│ │ └─ customer-signup/ # ← your process
│ │ ├─ topics/
│ │ │ ├─ student-check/
│ │ │ │ ├─ handler.ts # subscribe('student-check', …)
│ │ │ │ ├─ schema.ts # zod in/out vars
│ │ │ │ └─ service.ts # business logic for this step
│ │ │ ├─ free-trial-eligibility/
│ │ │ │ ├─ handler.ts
│ │ │ │ ├─ schema.ts
│ │ │ │ └─ service.ts
│ │ │ └─ finalize-enrollment/
│ │ │ ├─ handler.ts
│ │ │ ├─ schema.ts
│ │ │ └─ service.ts
│ │ └─ shared.ts # small helpers shared only by this process
│ ├─ services/ # reusable domain helpers across processes
│ │ ├─ verification.service.ts # e.g., “isValidStudent(email)”
│ │ ├─ subscription.service.ts # createSubscription, calcTrialEnd, etc.
│ │ └─ http.service.ts # got/undici wrapper (timeouts, retry, jitter)
│ ├─ repositories/ # DB access & event logging
│ │ ├─ user.repo.ts
│ │ └─ event-log.repo.ts
│ ├─ lib/
│ │ ├─ camunda.ts # readVars/completeWith/handle errors
│ │ ├─ errors.ts # BusinessRuleError, etc.
│ │ └─ util.ts
│ └─ routes/
│ └─ v1/processes.ts # optional: start sync bridge, status, etc.
└─ test/… # unit tests for service.ts & handler.ts
