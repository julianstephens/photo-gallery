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
