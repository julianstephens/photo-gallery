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
