# Photo Gallery Server

Backend server for the photo gallery application.

## Development

### Running the server

```bash
pnpm dev
```

### Building

```bash
pnpm build
```

## Testing

The server includes comprehensive unit and integration tests using Vitest.

### Running tests

```bash
# Run all tests once
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# Run tests with UI
pnpm test:ui
```

### Test Structure

The test suite includes:

- **Unit Tests**: Test individual services and utilities
  - `src/services/upload.test.ts` - Tests for file upload utilities
  - `src/services/bucket.test.ts` - Tests for MinIO bucket operations
  - `src/api/gallery.test.ts` - Tests for gallery API validation logic

- **Integration Tests**: Test API routes and request handling
  - `src/routes.test.ts` - Tests for Express route handlers

### Running from Root

You can also run server tests from the root directory:

```bash
# From root directory
pnpm test:server
pnpm test:server:watch
pnpm test:server:coverage
```

## Environment Variables

Create a `.env` file in the server directory with the following variables:

```
PORT=4000
MINIO_ENDPOINT=your-minio-endpoint
MINIO_PORT=9000
MINIO_ACCESS_KEY=your-access-key
MINIO_SECRET_KEY=your-secret-key
DISCORD_CLIENT_ID=your-discord-client-id
DISCORD_CLIENT_SECRET=your-discord-client-secret
DISCORD_REDIRECT_URI=your-redirect-uri
```

### Logging Configuration

The server uses [pino](https://github.com/pinojs/pino) for structured logging with environment-aware output configuration:

| Variable             | Default        | Description                                                                                         |
| -------------------- | -------------- | --------------------------------------------------------------------------------------------------- |
| `LOG_LEVEL`          | `info`         | Log level: `debug`, `info`, `warn`, `error`                                                         |
| `LOG_OUTPUT`         | Auto           | Output mode: `stdout`, `file`, or `both`. Defaults to `stdout` in production, `file` in development |
| `LOKI_URL`           | -              | Optional Loki push URL for direct log ingestion                                                     |
| `LOG_FILE_PATH`      | `logs/app.log` | Path for file-based logging                                                                         |
| `LOG_FILE_MAX_SIZE`  | `10M`          | Max file size before rotation                                                                       |
| `LOG_FILE_MAX_FILES` | `7`            | Number of rotated files to retain (days)                                                            |

#### Production Logging

In production (`NODE_ENV=production`), logs are written to stdout/stderr in JSON format for ingestion by Loki/Grafana:

```bash
# Container logs are automatically JSON-formatted
LOG_OUTPUT=stdout  # default in production
```

#### Development Logging

In development, logs are written to rotating files with optional pretty console output:

```bash
LOG_OUTPUT=file    # rotating file logs (default in development)
LOG_OUTPUT=both    # file + pretty console output
LOG_OUTPUT=stdout  # pretty console output only
```

File rotation ensures logs don't consume excessive disk space:

- Files rotate daily and when exceeding `LOG_FILE_MAX_SIZE`
- Rotated logs are gzip compressed
- Old logs are automatically removed after `LOG_FILE_MAX_FILES` days

#### Child Loggers

Use `createChildLogger` to add request/job context to log entries:

```typescript
import { createChildLogger } from "./middleware/logger.ts";

const reqLogger = createChildLogger({ requestId: req.id, userId: user.id });
reqLogger.info("Processing request");
```

#### PII Safety

All loggers automatically redact sensitive fields:

- Authorization headers
- Cookies and session data
- Passwords, tokens, and API keys

## Tech Stack

- **Express** - Web framework
- **TypeScript** - Type safety
- **MinIO** - Object storage
- **Vitest** - Testing framework
- **Supertest** - HTTP assertions
