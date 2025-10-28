# Contributing to fastify-camunda

Thank you for your interest in contributing to fastify-camunda! This document provides guidelines and standards for contributing to the project.

## Development Setup

### Prerequisites

- Node.js 18 or higher
- pnpm (recommended) or npm
- Microsoft SQL Server access
- Git

### Getting Started

1. Fork the repository
2. Clone your fork: `git clone <your-fork-url>`
3. Install dependencies: `pnpm install`
4. Create a `.env` file based on `.env.example`
5. Run tests to verify setup: `pnpm test`
6. Start development server: `pnpm run dev`

## Contribution Workflow

### Branch Naming

Use descriptive branch names following these patterns:

- `feature/description` - New features (e.g., `feature/add-payment-process`)
- `fix/description` - Bug fixes (e.g., `fix/timeout-handling`)
- `docs/description` - Documentation updates (e.g., `docs/update-api-reference`)
- `refactor/description` - Code refactoring (e.g., `refactor/extract-validation`)
- `test/description` - Test additions or updates (e.g., `test/add-waitroom-tests`)

### Commit Messages

Write clear, descriptive commit messages:

- Use present tense ("Add feature" not "Added feature")
- Start with a verb ("Add", "Fix", "Update", "Remove", etc.)
- Keep first line under 72 characters
- Reference issues when applicable: "Fix timeout issue (#123)"

Examples:

```
Add payment process with stripe integration
Fix waitroom memory leak on server shutdown
Update API documentation for status endpoint
```

### Pull Request Process

1. Create a new branch from `main`
2. Make your changes following the code style guidelines
3. Add or update tests for your changes
4. Run tests and ensure they pass: `pnpm test`
5. Update documentation if needed
6. Commit your changes with clear messages
7. Push to your fork
8. Open a pull request with:
   - Clear title describing the change
   - Description of what changed and why
   - Links to related issues
   - Screenshots/examples if applicable

### Pull Request Requirements

Before submitting a PR, ensure:

- [ ] All tests pass (`pnpm test`)
- [ ] Code coverage remains above 80% (`pnpm test:cov`)
- [ ] No TypeScript errors (`pnpm run build`)
- [ ] Code follows style guidelines (see below)
- [ ] Documentation is updated if needed
- [ ] Commit messages are clear and descriptive

## Code Style Guidelines

### TypeScript Standards

- Use TypeScript for all new code
- Define types explicitly, avoid `any` except when necessary
- Use interfaces for object shapes, types for unions/intersections
- Export types that may be reused

Example:

```typescript
interface ProcessRequest {
  processKey: string;
  correlationId: string;
  variables?: Record<string, any>;
}

async function startProcess(request: ProcessRequest): Promise<ProcessResult> {
  // implementation
}
```

### File Organization

- One main export per file
- Group related functions in the same file
- Keep files focused and under 300 lines when possible
- Use barrel exports (`index.ts`) sparingly

### Naming Conventions

- **Files**: kebab-case (e.g., `process-store.ts`, `event-log.repo.ts`)
- **Functions/variables**: camelCase (e.g., `startProcess`, `correlationId`)
- **Classes/Interfaces/Types**: PascalCase (e.g., `ProcessStore`, `EventLog`)
- **Constants**: SCREAMING_SNAKE_CASE (e.g., `SYNC_TIMEOUT_MS`, `PROCESS_DEFAULTS`)

### Formatting

- Use 2 spaces for indentation
- Use semicolons
- Use double quotes for strings (except when avoiding escaping)
- Use trailing commas in multi-line objects/arrays
- Keep lines under 80 characters when reasonable

### Comments and Documentation

- Use JSDoc comments for functions, classes, and complex logic
- Explain "why" not "what" in comments
- Keep comments up to date with code changes
- Document all public APIs

Example:

```typescript
/**
 * Create a wait for a process identified by correlationId. Returns a promise
 * that resolves when completeWait is called or rejects on timeout.
 *
 * @param correlationId Unique identifier for the process
 * @param ms Timeout in milliseconds
 * @returns Promise that resolves with the process result or rejects on timeout/error
 */
export function createWait(correlationId: string, ms: number): Promise<any> {
  // implementation
}
```

## Testing Guidelines

### Test Structure

- Place tests in the `test/` directory
- Name test files: `*.test.ts`
- Group related tests with `describe` blocks
- Use descriptive test names with `it` or `test`

### Test Coverage Requirements

- Maintain minimum 80% code coverage
- Test both success and error paths
- Test edge cases and boundary conditions
- Mock external dependencies (database, HTTP calls, Camunda)

### Writing Tests

Example structure:

```typescript
describe("waitroom", () => {
  describe("createWait", () => {
    it("resolves when completeWait is called", async () => {
      const correlationId = "test-123";
      const promise = createWait(correlationId, 5000);
      completeWait(correlationId, { result: "success" });
      await expect(promise).resolves.toEqual({ result: "success" });
    });

    it("rejects on timeout", async () => {
      const correlationId = "test-timeout";
      const promise = createWait(correlationId, 100);
      await expect(promise).rejects.toThrow("Process timeout");
    });
  });
});
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:cov

# Run specific test file
pnpm test -- waitroom.test.ts
```

## Adding New Processes

When adding a new Camunda process, follow this structure:

1. Create process directory: `src/camunda/processes/<process-name>/`
2. Define process steps in `shared.ts`
3. Create topic handlers in `topics/<topic-name>/`
4. Each topic needs:
   - `handler.ts` - Subscribe to topic and orchestrate
   - `service.ts` - Business logic
   - `schema.ts` - Zod schemas for validation
5. Register process in `src/camunda/index.ts`
6. Add tests in `test/<topic-name>.test.ts`

See [Creating a Process](docs/guides/creating-a-process.md) for detailed guide.

## Documentation Standards

### When to Update Documentation

Update documentation when you:

- Add new features or APIs
- Change existing behavior
- Add new configuration options
- Modify database schema
- Change architectural patterns

### Documentation Style

Follow the Fastify documentation style guide:

- Use active voice
- Be concise and direct
- Use present tense
- Start action items with verbs
- Avoid terms like "just", "simply", "obviously"
- Use code examples liberally
- Link to related documentation

### Documentation Organization

- **Guides** (`docs/guides/`): Educational, step-by-step, uses "you"
- **Reference** (`docs/reference/`): Technical specs, formal, no "you"
- **Design** (`docs/design/`): Architecture decisions, explains "why"

## Code Review Process

### For Contributors

- Respond to feedback promptly
- Be open to suggestions and alternative approaches
- Ask questions if feedback is unclear
- Update your PR based on review comments

### For Reviewers

- Be respectful and constructive
- Explain the reasoning behind suggestions
- Focus on code quality, not personal preferences
- Approve when requirements are met

## Questions or Issues

If you have questions or run into issues:

1. Check existing documentation in `docs/`
2. Search existing issues
3. Ask in pull request comments
4. Open a new issue with detailed information

## Recognition

All contributors will be recognized in the project. Thank you for helping improve fastify-camunda!
