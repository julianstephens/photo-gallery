## v0.2.2

### Fixed

- Decoupled server and gradient worker build configurations.
- Fixed REDIS_URL initialization to run before utils/redis import.
- Ensured gradient dependency is properly added to server build.
- Fixed image naming in build process.
- Fixed import paths for Redis-specific utilities.

### Improved

- Updated Coolify manifest for deployment configuration.
- Refactored notifications container to remain awake for Coolify scheduler.

### Technical Improvements

- Improved CI workflow with registry caching and matrix reference updates.
- Added example environment configuration file.

## v0.2.1

### Added

- Added endpoints for super admins to manage user requests.

### Improved

- Updated and improved project documentation in `README.md`.

### Technical Improvements

- Added `coolify.manifest.json` to support declarative deployments with `coolify-deploy`.

## v0.2.0

### Added

- Implemented a new worker to send Discord notifications for expiring galleries, and added UI indicators to warn users of impending expirations.
- Added multi-select functionality to galleries, allowing users to delete multiple items at once.
- Introduced a new admin page for managing guild-specific settings, backed by Redis.
- Added API endpoints to support administrative actions on user requests.
- Implemented helpers for role-based access control on request-related actions.
- Introduced additional caching layers to mitigate 429 rate-limiting errors from external services.

### Fixed

- Resolved an issue where stale uploads would remain queued after a page reload, and improved the upload monitor's display and clearing logic.
- Ensured gallery data is consistently invalidated and refetched after uploads to prevent displaying outdated content.
- Limited upload concurrency and adjusted rate limits to improve the reliability of large uploads.
- Added a production-ready Content Security Policy (CSP) and addressed a potential missing CSRF middleware vulnerability.

### Improved

- Implemented silent authentication revalidation when page visibility changes to ensure session consistency.
- Enhanced CSRF debugging and added more detailed client-side upload logging.

### Technical Improvements

- Restructured the project into an apps and packages monorepo layout using pnpm workspaces for better modularity and dependency management.
- Optimized the deployment workflow by restructuring jobs and improving orchestration.
- Moved the gradient generation logic into its own dedicated worker package.

## v0.1.2

### Fixed

- Login cycles on session timing issues - implemented exponential backoff retry strategy (500ms → 1s → 2s) for OAuth session persistence race conditions
- Session availability race condition - added 3-attempt retry logic with detailed logging for auth state validation
- Page visibility handling - added auth revalidation when user returns to browser tab to ensure session state consistency

### Improved

- Authentication error handling - enhanced diagnostics with session key information and token presence tracking
- Upload progress polling - consolidated logging to use central logger instead of console methods for better observability
- Loki batch transport - added structured logging for batch preparation, stream grouping, and transmission failures
- Overall logging consistency - unified all client-side logging through central Pino logger for production log aggregation

### Technical Improvements

- Added page visibility listener in AuthContext to revalidate auth when document becomes visible
- Improved retry logic with exponential backoff for handling session persistence delays
- Enhanced server-side auth logging with session ID and access token availability checks
- Better error context in Loki transport for debugging log delivery failures

## v0.1.1

### Added

- Superadmin support with elevated permissions for user management
- Request domain model with Redis persistence for user requests/feedback

### Fixed

- Media preview routing - moved media endpoint from `/media` to `/api/media` for proper API gateway handling
- Gallery detail view not updating after uploads - fixed React Query cache invalidation
- Login redirect loop in production - added client-side retry logic for session availability timing issues
- Production logging visibility - enhanced debug logging in production with readable output when `LOG_LEVEL=debug`
- Folder uploads in production - improved logging for debugging upload failures
- Rate limiting on chunked uploads - added lenient rate limiter to allow large file uploads
- Trust proxy configuration for deployments behind reverse proxies (e.g., Cloudflare)

### Technical Improvements

- Added comprehensive debug logging for OAuth callback flow
- Enhanced session tracking in authentication middleware
- Improved error handling and retry mechanisms in auth flow
- Better logging configuration for production debugging scenarios

## v0.1.0

- Adds photo gallery client and server
