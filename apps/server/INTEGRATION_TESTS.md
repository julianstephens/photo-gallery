# Integration Tests

Integration tests require local test data files that are in `.gitignore` and not available in CI/CD environments.

## Running Integration Tests Locally

Integration tests run automatically with `pnpm test`:

```bash
pnpm test
```

The integration test validates the 107 MB "Saved Pictures.zip" chunked upload, which tests the stream backpressure handling fix for large files.

### Running Only Integration Tests

If you want to focus exclusively on the large upload suite (skipping the faster unit tests), use the dedicated script:

```bash
pnpm test:integration
```

This command executes only the `*.integration.test.ts` files under `server/`, assuming the required local fixtures are present.

## Skipping Integration Tests in CI/CD

For CI/CD pipelines that don't have access to test data files, you can skip integration tests using environment variables.

### Option 1: Skip by File Pattern (Recommended for CI/CD)

Configure your CI/CD to exclude `.integration.test.ts` files:

```yaml
# Example for GitHub Actions
- name: Run Tests
  run: pnpm test -- --exclude '**/*.integration.test.ts'
```

Or in vitest config:

```typescript
// vitest.config.ts
exclude: [
  "**/node_modules/**",
  "**/*.integration.test.ts", // Skip integration tests
];
```

### Option 2: Skip by Environment Variable

```bash
# In CI/CD environment
SKIP_INTEGRATION_TESTS=true pnpm test
```

Then in your test file:

```typescript
it.skipIf(process.env.SKIP_INTEGRATION_TESTS, "test name", async () => {});
```

### Option 3: Use CI Detection

The `src/utils/ci.ts` utility provides `isCI()` function to detect CI environments:

```typescript
import { isCI } from "../utils/ci.ts";

it.skipIf(isCI(), "should test large file", async () => {});
```

## CI Environment Detection

Supported CI platforms:

- GitHub Actions (GITHUB_ACTIONS)
- GitLab CI (GITLAB_CI)
- CircleCI (CIRCLECI)
- Jenkins (BUILD_ID)
- Travis CI (TRAVIS)
- Azure Pipelines (AZURE_PIPELINES)
- Buildkite (BUILDKITE)
- Drone CI (DRONE)
- Generic CI flag (CI or CONTINUOUS_INTEGRATION)
