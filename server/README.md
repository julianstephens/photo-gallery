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

## Tech Stack

- **Express** - Web framework
- **TypeScript** - Type safety
- **MinIO** - Object storage
- **Vitest** - Testing framework
- **Supertest** - HTTP assertions
