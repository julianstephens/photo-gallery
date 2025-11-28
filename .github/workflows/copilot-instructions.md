# Copilot contributor guidelines — julianstephens/photo-gallery

This repository is a TypeScript full‑stack gallery management tool optimized for Discord communities. When contributing, follow these guidelines to keep the codebase consistent, safe, and maintainable.

---

## High level goals

- Build safe, performant handling of large image uploads.
- Keep a clean, readable TypeScript codebase with strong types and tests.
- Make gallery share links secure-by-design (unguessable tokens, hashed server side).
- Keep the public browsing experience fast via thumbnails/variants and CDN caching.
- Protect sensitive credentials and PII (never commit secrets).

---

## Required before each commit

Run these steps locally before pushing code:

- pnpm install to ensure lockfile is up to date for CI.
- pnpm format — run Prettier on staged files (or run `prettier` if a different script is used).
- pnpm lint — run ESLint and fix obvious problems.
- pnpm build — build the project to ensure no new type errors.
- pnpm test — run unit tests (and integration tests where feasible).

Note: If this repo uses a different script name for any of these tasks, use that project script; the intent is to always format, lint, typecheck, and test before committing.

---

## Development flow

1. Branching
   - Use short‑lived feature branches named `feat/<short-description>`, `fix/<short-description>`, or `chore/<short-description>`.
   - For quick successive releases and short-lived branches, prefer rebasing or "rebase & merge" (linear history). If branches are shared or long-lived, prefer merge commits. Keep the team's policy consistent and enforced with branch protection.

2. Work cycle
   - Create feature branch from `main` (or trunk).
   - Rebase frequently on `main` to reduce conflicts.
   - Open a PR with a clear description and acceptance criteria.
   - Add unit & integration tests for new behavior.
   - Wait for CI (lint, build, tests) and at least one code review approving the PR.
   - Merge using the repo's configured strategy (rebase/squash/merge) consistent with team policy.

3. Commit messages
   - Use Conventional Commits where possible:
     - feat: ...
     - fix: ...
     - chore: ...
     - docs: ...
     - test: ...
     - refactor: ...
   - Make messages descriptive (what and why).

---

## How to run locally (typical)

- Install deps:
  - pnpm i
- Start:
  - pnpm dev — runs the frontend and backend (adjust if project splits web/api).
- Tests:
  - pnpm test — unit tests
  - pnpm test:integration — integration/e2e tests (if present)
    If the repo uses a monorepo/tooling layout, follow the root README scripts. If a local worker is required (image processing), run it separately as documented in the README.

---

## Repository structure (actual)

- `client/` – Vite/React frontend
  - `src/components/` – gallery UI, cards, forms, modals, shared UI primitives
  - `src/pages/` – landing, dashboard, admin, and 404 routes
  - `src/hooks/`, `src/utils/`, `src/queries.ts` – client state, API helpers, query keys
  - `public/`, `assets/`, `workers/` – static assets and upload worker bundle
- `server/` – Express API and background logic (TypeScript)
  - `src/controllers/`, `src/handlers/` – HTTP route handlers and composition layer
  - `src/services/`, `src/utils.ts` – storage, upload, and Redis helpers (includes `chunkedUpload.integration.test.ts`)
  - `src/middleware/`, `src/schemas/`, `src/types.ts` – validation, auth, and typing
  - `scripts/` – operational scripts (gallery cleanup, listings, AppleDouble remover)
  - `logs/`, `Dockerfile`, `vitest.config.ts`, `tsup.config.ts` – observability and build/test config
- `utils/` – shared package consumed via workspace protocol
  - `src/schemas/`, `src/types/` – cross-project DTOs and zod schemas
- Root configs – `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `eslint.config.ts`, `commitlint.config.js`, `README.md`, `SITE.md`
- Tooling directories – `.github/workflows/` (CI), `client/Dockerfile`, `server/Dockerfile`

When adding new top-level folders, update this section plus README and CI workflows accordingly.

---

## Coding standards & style

- TypeScript
  - Prefer strict typing — avoid `any` unless unavoidable and documented.
  - Export well-typed functions and interfaces for modules that represent boundaries.
  - Use async/await consistently for async flows.
  - Prefer small, single-responsibility modules and functions.

- Formatting
  - Prettier for code formatting. Configure via .prettierrc in root.
  - ESLint for linting. Follow recommended TypeScript rules and the project's existing rules.

- Imports
  - Use absolute import aliases if configured (e.g., `@/lib/prisma`), or relative imports consistently.
  - Keep import order consistent: external modules first, then internal modules.

- Error handling
  - Throw or return typed error results; avoid swallowing errors.
  - For server handlers, ensure errors surface to monitoring (Sentry) and return sanitized messages to clients.

- Tests
  - Use Jest or the project's test framework, prefer typed tests.
  - Write unit tests for business logic (image processing rules, token verification, DB interaction wrappers).
  - Add integration tests for API endpoints that validate auth and public access flows.
  - For UI, use React Testing Library and/or Playwright/Cypress for end-to-end tests.

---

## Security, privacy & data handling (photo-gallery specific)

- Secrets
  - Never commit S3 keys, DB URLs, or other secrets. Keep them only in environment variables or secret managers.
  - Add .env to .gitignore and provide .env.example with variable names and descriptions.

- Tokens & links
  - Share tokens should be generated securely (crypto.randomBytes) and stored hashed (bcrypt/argon2). Never log plaintext tokens.
  - PRs that touch token storage or verification must include tests to ensure tokens are validated and old tokens revoked on regeneration.

- Image uploads
  - Validate file types and sizes server-side.
  - Prevent zip-slip by sanitizing extracted file paths.
  - Strip or limit sensitive EXIF data by default (remove GPS by default).
  - Scan uploads for malware if the risk profile requires it (e.g., integrate ClamAV).
  - Limit number of files and total uncompressed size per upload.

- Access control
  - Admin-only operations must verify admin role or allowlist.
  - Public gallery endpoints must validate slug+token and only expose public friendly variants (thumb/display) unless the token allows originals.
  - Use short-lived presigned URLs for original-download links.

---

## Image processing & storage guidelines

- Use a robust image library (Sharp recommended) for:
  - Orientation normalization
  - Generating web-optimized display variants and thumbnails (WebP/AVIF fallback to JPEG)
  - Resizing and compressing to sensible dimensions (thumbnails ~300–500px, display variants 1280–2048px)
- Upload pipeline
  - Upload raw ZIP to a staging area (object storage).
  - Process ZIP in a worker, stream-unzip entries, filter by extension, and generate variants.
  - Upload originals and variants to object storage (S3/R2) with sensible Cache-Control headers.
- Keys and privacy
  - Use generated object keys under `gallery/{galleryId}/...` rather than user-provided file paths.
  - Originals can be private and served via presigned URLs; thumbnails/display variants may be public/CDN-backed.
- Bulk downloads
  - Provide on-demand zipping or prebuild cached archives; protect against abuse (rate limits, quotas).

---

## Redis Store

- **Connection**: `server/src/redis.ts` creates a single Redis client via `redis://<user>:<password>@<host>:<port>/<db>` using env vars (`REDIS_HOST`, `REDIS_PORT`, `REDIS_USER`, `REDIS_PASSWORD`, `REDIS_DB`). Errors are logged and the client is reused app-wide.
- **Session storage**: Express sessions use `connect-redis` with the prefix `pg:sess:`; see `server/src/server.ts`. Cookies inherit the same TTL/security settings defined in `env.ts`.
- **Upload jobs**: `UploadJobService` stores jobs under `upload:job:<id>` plus a `upload:jobs` list. Keys carry 24h TTLs (shorter for terminal states) so the dashboard can resume in-flight uploads and prune finished ones automatically.
- **Gallery metadata cache**: `GalleryController` caches guild galleries in sets and hashes (`guild:<guildId>:galleries`, `guild:<guildId>:gallery:<name>:meta`) with expiration tracking in `galleries:expiries:v2`. Lookups avoid hitting S3 for every folder scan and stale entries are culled atomically.
- **Gradient worker**: The gradient pipeline (`server/src/workers/gradient.ts`) keeps queue state in Redis lists (`gradient:queue`, `gradient:processing`), delayed retries in a sorted set (`gradient:delayed`), and job payloads at `gradient:job:<id>`. `GradientMetaService` stores per-image gradients at `gradient:<storageKey>` with a 30‑day TTL so the client can render blur placeholders instantly.
- **Other caches**: Controllers (e.g., `guild.ts`, `gallery.ts`) use Redis for guild lookup dedupe, gallery list membership, and rate-limit friendly metadata fetches. If you add new Redis consumers, document key prefixes and TTL choices to keep observability sane.

---

## CI / CD

- CI should run:
  - install, format check, lint, build, and unit tests.
- PRs must pass CI before merging.
- Use protected branches for `main` with required checks (CI, reviews).
- Automate deployments with a CI workflow (Vercel, Netlify, GitHub Actions + serverless/container deployment).

---

## Pull request & review checklist

For every PR, ensure:

- [ ] Title follows Conventional Commits or includes a clear prefix (feat/, fix/, chore/).
- [ ] Description summarizes what changed, why, and any migration steps.
- [ ] All required CI checks pass.
- [ ] Format, build, and lint are passing locally.
- [ ] Unit tests added/updated for logic changes.
- [ ] Integration tests added for public/private flows where appropriate.
- [ ] Documentation updated (README, docs/) for new features or env vars.
- [ ] No secrets committed.
- [ ] Performance and cost considerations (image sizes, egress) addressed.
- [ ] Accessibility considered for UI changes (keyboard navigation, alt tags).

---

## Copilot / code-generation guidance

When suggesting or generating code for this repo:

- Match the existing TypeScript style: strong types, explicit return types on exported functions, prefer small helpers.
- Always include tests for generated behavior (unit/integration).
- For new endpoints or scripts:
  - Add or update README/DEVNOTES with required env vars and example usage.
  - If changes affect DB schema, include Prisma migration files and update any factory/test fixtures.
- For image processing code:
  - Include safeguards (file type checks, size limits, zip-slip prevention).
  - Provide clear logging and structured errors suitable for Sentry/monitoring.
- For network/storage calls:
  - Use retry/backoff patterns where applicable.
  - Ensure credentials are read from environment variables and not hardcoded.

---

## Documentation

- Keep the root README up to date with:
  - Local dev steps
  - Env var explanations (.env.example)
  - How to run the worker and process uploads
  - How to run migrations and seed data
- Add short HOWTO docs in `docs/` for complex topics:
  - Upload & processing pipeline
  - Regenerating share links and revoking old ones
  - Cleaning up storage (S3) and deleting galleries safely

---

## Observability & operations

- Integrate error monitoring (Sentry or equivalent) for API and worker code.
- Add structured logs with request IDs for easier tracing.
- Expose metrics for:
  - worker queue depth and processing time
  - images processed per minute
  - failed image conversions
- Add alerting for large queue backlogs or repeated processing failures.

---

## Key guidelines (summary)

1. Keep commits small, CI green, and branches short-lived.
2. Enforce formatting, linting, and typechecking before merging.
3. Write tests for all new behavior; protect public/private access rules by test.
4. Treat secrets and user-uploaded data with care (do not log tokens/plaintext secrets; strip sensitive EXIF).
5. Generate secure tokens server-side and never persist plaintext tokens.
6. Optimize storage and egress (WebP/AVIF variants, CDN caching, presigned URLs for originals).
7. Document operational steps (migrations, backups, deployment) clearly in README/docs.

---

If you want, I can generate a starter PR or a template checklist, a GitHub Actions CI workflow example, or a starter eslint/prettier/tsconfig setup tailored to this project — tell me which you prefer next.
