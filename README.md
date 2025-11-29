# Photo Gallery 5000

Photo Gallery 5000 is a full-stack gallery management tool optimized for Discord communities that need to ingest large photo drops, curate them per guild, and expose them through a clean browser UI.

## Repository Overview

- **Client (`client/`)** – React 19 + Vite front end styled with Chakra UI. Key folders like `src/components/`, `src/pages/`, `src/hooks/`, and `src/lib/upload/uploadJobWorker.ts` handle gallery UI, auth context, upload progress workers, and route wiring. React Query + upload workers stream chunk progress back to the UI.
- **Server (`server/`)** – Express 5 API plus background workers. `src/controllers/`, `src/handlers/`, `src/services/`, `src/middleware/`, and `src/workers/` cover HTTP flows, chunked uploads, Redis-backed queues, and gradient generation. Vitest (unit + `*.integration.test.ts`) and scripts under `server/scripts/` support operational tasks.
- **Shared Utilities (`utils/`)** – Workspace package with Zod schemas, DTOs, and type helpers consumed by both client and server to keep validation/payloads consistent.
- **Data + Tooling** – Repo-level configs (`pnpm-workspace.yaml`, `eslint.config.ts`, `.github/workflows/`) keep the monorepo wired together.

## Architectural Highlights

- **Chunked Upload Service** – `ChunkedUploadService` assembles large uploads, applies server-side checksum verification, and writes assembled files to S3-compatible storage. Upload job metadata lives in Redis so clients can resume progress instantly.
- **Gradient Worker Pipeline** – `server/src/workers/gradient.ts` dequeues image jobs from Redis, generates blur placeholders + gradients, and stores results via `GradientMetaService` for fast client rendering.
- **Redis-Centric State** – Redis backs everything from Express sessions (`pg:sess:` prefix) to guild/gallery metadata, upload job queues, and gradient caches, giving the API DB-less speed while enforcing TTL cleanup routines.
- **Shared Validation + Types** – Zod schemas in `utils/` compile into TypeScript types that React forms, Express handlers, and workers all share, eliminating drift between front end and API contracts.
- **Tested Workflows** – Vitest covers controllers/services plus integration tests (`pnpm test:integration`) that exercise the chunked upload pipeline, ensuring checksum, storage, and worker behaviors remain reliable.

This repository favors clear separation between validation, controller logic, and infrastructure concerns, enabling confident iteration on either side of the stack while keeping cross-cutting concerns (uploads, gradients, Redis) testable end-to-end.
