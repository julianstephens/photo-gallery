# Photo Gallery 5000

Photo Gallery 5000 is a full-stack gallery management tool optimized for Discord communities that need to ingest large photo drops, curate them per guild, and expose them through a clean browser UI.

## Repository Overview

- **Client (`client/`)** – React 19 + Vite app styled with Chakra UI. It handles authentication state, guild/gallery selection, file uploads (images + ZIP), and realtime upload job feedback via React Query workers.
- **Server (`server/`)** – Express 5 API backed by Redis for session + gallery metadata, AWS S3 (or S3-compatible) storage for assets, and Vitest for comprehensive unit coverage. Controllers encapsulate business logic (gallery creation, slug normalization, ZIP watchdog uploads, guild defaults) while handlers focus on validation/HTTP concerns.
- **Shared Utilities (`utils/`)** – Zod schemas and shared TypeScript types consumed by both client and server to keep validation and payload shapes consistent.
- **Scripts (`server/scripts/`)** – Operational helpers (e.g., `listGallery.ts`) that call controllers directly for maintenance tasks such as enumerating gallery contents.

## Architectural Highlights

- **Slug-aware Galleries** – Every gallery name is normalized to a slugged folder name that is stored alongside metadata. The server resolves this slug for every S3 operation, so UI names can remain human-friendly while storage stays consistent.
- **Asynchronous ZIP Pipeline** – Large ZIP uploads are queued as background jobs with watchdog timeouts, stream processing, and Redis-backed progress tracking. The client reattaches to jobs to show completion, failure, or timeout states.
- **Redis-driven Metadata** – Redis keeps per-guild gallery sets, TTL metadata, and default selections. Controllers clean up expired galleries and ensure cross-component consistency without extra DBs.
- **Shared Validation** – Zod schemas compile into TypeScript types that both React forms and Express handlers consume, guaranteeing aligned validation rules across the stack.

This repository favors clear separation between request validation, controller logic, and infrastructure concerns, enabling confident iteration on either side of the stack while maintaining testable boundaries.

## Architecture Diagram

```
┌────────────┐        HTTPS/JSON        ┌────────────┐        Redis commands        ┌────────┐
│  Client    │ ───────────────────────▶ │  Server    │ ───────────────────────────▶ │ Redis  │
│ (React +   │ ◀─────────────────────── │ (Express   │ ◀─────────────────────────── │        │
│  React     │   Upload job polling     │  handlers, │   Session + gallery meta     └────────┘
│  Query)    │                          │  controllers│
└────┬───────┘                          └────┬───────┘
	│   Uploads (images/ZIP)                │  Streams/buffers
	▼                                        ▼
┌────────────┐  Signed object access   ┌────────────┐
│  Browser   │◀───────────────────────▶│   S3 /     │
│  Gallery   │                        │  Object    │
│  Viewer    │  Direct image viewing  │  Storage   │
└────────────┘                        └────┬───────┘
								   │
								   │ ZIP processing watchdog
								   ▼
							    ┌────────────┐
							    │ Upload Job │
							    │   Service  │
							    └────────────┘
```

Data flow summary:

- Users interact with the React client, which calls Express APIs and streams uploads directly through the server.
- The server reads/writes gallery metadata and session data in Redis while streaming binary objects into S3-compatible storage.
- Background ZIP jobs update Redis progress so the client can poll for status, and the browser fetches finalized images straight from object storage using presigned URLs.

## Logging Architecture

The server uses [pino](https://github.com/pinojs/pino) for structured logging with environment-aware configuration:

### Production Logging (Grafana/Loki Integration)

In production, logs are written to stdout/stderr in JSON format for container log aggregation:

```
Container stdout → Docker/K8s → Loki → Grafana
```

- **JSON format** enables structured querying in Grafana
- **Request IDs** (`x-request-id`) correlate logs across requests
- **PII redaction** removes sensitive fields before logging
- **No file logging** avoids disk consumption in containers

### Development Logging

In development, logs use rotating files to manage disk space:

- **Rotating file sink** with configurable size/time limits
- **Gzip compression** of rotated logs
- **Automatic cleanup** of old log files
- **Optional pretty console** output for debugging

### Logger Configuration

Configure via environment variables:

| Variable             | Production Default | Development Default |
| -------------------- | ------------------ | ------------------- |
| `LOG_OUTPUT`         | `stdout`           | `file`              |
| `LOG_LEVEL`          | `info`             | `info`              |
| `LOG_FILE_MAX_SIZE`  | -                  | `10M`               |
| `LOG_FILE_MAX_FILES` | -                  | `7`                 |

### Child Loggers

Use `createChildLogger` for request/job-scoped logging with context:

```typescript
const reqLogger = createChildLogger({
  requestId: req.id,
  guildId: guild.id,
  jobId: job.id,
});
reqLogger.info("Processing upload");
```
