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
