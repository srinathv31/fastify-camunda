# fastify-camunda

A Fastify-based Camunda worker service that provides a sync/async REST API pattern for workflow orchestration. This service enables external clients to start Camunda processes and receive either immediate results or asynchronous status polling, making it ideal for integrating complex business workflows into modern APIs.

## Overview

fastify-camunda bridges the gap between synchronous REST APIs and asynchronous workflow engines. It provides:

- **Hybrid sync/async pattern**: Start a process and get immediate results if completed within timeout (default 25s), or get a polling URL for longer-running processes
- **Process state management**: In-memory Map with async database persistence for fast access and durability
- **Event logging**: Comprehensive audit trail for each workflow step
- **Type-safe workflow definitions**: TypeScript and Zod schemas for validated inputs and outputs
- **Extensible architecture**: Plugin-based system for easy customization and testing

## Quick Start

### Prerequisites

- Node.js 18+ and pnpm
- Microsoft SQL Server (or compatible database)
- Camunda Platform 7 (or use mock mode)

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd fastify-camunda

# Install dependencies
pnpm install

# Configure environment
cp .env.example .env
# Edit .env with your database and Camunda settings

# Build
pnpm run build

# Start development server
pnpm run dev
```

### Running Your First Process

```bash
# Start the onboard-user process
curl -X POST http://localhost:8080/api/process/start \
  -H "Content-Type: application/json" \
  -d '{
    "processKey": "onboard-user",
    "correlationId": "user-123",
    "variables": {
      "userId": "user-123",
      "email": "user@example.com"
    }
  }'

# If you receive a 202 response, poll for status
curl http://localhost:8080/api/process/status/user-123
```

## Technology Stack

- **[Fastify](https://fastify.dev/)**: High-performance web framework
- **[Camunda External Task Client](https://github.com/camunda/camunda-external-task-client-js)**: Subscribe to and execute Camunda tasks
- **[TypeScript](https://www.typescriptlang.org/)**: Type-safe development
- **[Zod](https://zod.dev/)**: Runtime schema validation
- **[Pino](https://getpino.io/)**: Structured logging
- **[MSSQL](https://www.npmjs.com/package/mssql)**: Database client
- **[Jest](https://jestjs.io/)**: Testing framework

## Documentation

### For Developers Getting Started

- **[Getting Started Guide](docs/guides/getting-started.md)**: Detailed setup and installation
- **[Understanding the System](docs/guides/understanding-the-system.md)**: Learn how Camunda processes work in this framework
- **[Creating a Process](docs/guides/creating-a-process.md)**: Step-by-step tutorial for adding new workflows
- **[Testing Guide](docs/guides/testing-guide.md)**: How to test your workflows

### For Implementation Reference

- **[API Endpoints](docs/reference/api-endpoints.md)**: Complete REST API specification
- **[Plugins](docs/reference/plugins.md)**: Fastify plugins documentation
- **[Core Libraries](docs/reference/core-libraries.md)**: Internal library APIs
- **[Repositories](docs/reference/repositories.md)**: Database access patterns
- **[Services](docs/reference/services.md)**: Reusable service modules
- **[Error Handling](docs/reference/error-handling.md)**: Error types and handling patterns
- **[Configuration](docs/reference/configuration.md)**: Environment variables reference

### For Architecture and Design

- **[Architecture Overview](docs/design/architecture-overview.md)**: System architecture and design
- **[Callback Strategy](docs/design/callback-strategy.md)**: Sync/async pattern implementation
- **[Process Lifecycle](docs/design/process-lifecycle.md)**: Complete process flow
- **[Data Model](docs/design/data-model.md)**: Database and in-memory structures
- **[Design Decisions](docs/design/design-decisions.md)**: Architectural choices and trade-offs

## Project Structure

```
fastify-camunda/
├── src/
│   ├── server.ts              # Fastify app setup
│   ├── start.ts               # Entry point
│   ├── plugins/               # Fastify plugins (env, db, logger, etc.)
│   ├── routes/                # REST API routes
│   │   └── process/           # Process management endpoints
│   ├── camunda/               # Camunda process definitions
│   │   └── processes/         # Individual process implementations
│   │       └── onboard-user/  # Example: onboard-user process
│   ├── lib/                   # Core libraries (waitroom, process-store)
│   ├── services/              # Reusable service modules
│   └── repositories/          # Database access layer
├── test/                      # Unit and integration tests
├── docs/                      # Documentation
│   ├── guides/                # Getting started and tutorials
│   ├── reference/             # API and component reference
│   ├── design/                # Architecture and design docs
│   └── diagrams/              # Mermaid diagrams
└── dist/                      # Compiled output
```

## Contributing

We welcome contributions! Please read our [Contributing Guide](CONTRIBUTING.md) for details on our development process, coding standards, and how to submit pull requests.

## Scripts

```bash
pnpm run dev          # Start development server with hot reload
pnpm run build        # Compile TypeScript to JavaScript
pnpm start            # Run production server
pnpm test             # Run tests
pnpm test:watch       # Run tests in watch mode
pnpm test:cov         # Run tests with coverage report
```

## License

[Your License Here]

## Support

For questions or issues:

- Review the [documentation](docs/)
- Check existing [issues](link-to-issues)
- Open a new issue with detailed information
