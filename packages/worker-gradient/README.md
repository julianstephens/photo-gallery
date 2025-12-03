# Gradient Worker

A long-running worker that generates color gradients and blur placeholders for gallery images. The worker listens to a Redis queue for jobs and processes them with configurable concurrency.

## Features

- Processes gradient generation jobs from a Redis queue
- Generates color palettes from images using median-cut quantization
- Creates blur placeholder data URLs for progressive loading
- Supports configurable concurrency for parallel processing
- Exponential backoff retry for failed jobs
- Graceful shutdown with job recovery
- Structured JSON logging suitable for log aggregation (Loki, etc.)

## Environment Variables

| Variable                           | Required | Default | Description                                                   |
| ---------------------------------- | -------- | ------- | ------------------------------------------------------------- |
| `REDIS_URL`                        | Yes      | -       | Redis connection URL (e.g., `redis://user:pass@host:6379/0`)  |
| `S3_ENDPOINT`                      | Yes      | -       | S3-compatible storage endpoint URL                            |
| `S3_ACCESS_KEY`                    | Yes      | -       | S3 access key ID                                              |
| `S3_SECRET_KEY`                    | Yes      | -       | S3 secret access key                                          |
| `MASTER_BUCKET_NAME`               | Yes      | -       | Name of the S3 bucket containing gallery images               |
| `LOG_LEVEL`                        | No       | `info`  | Log level: `trace`, `debug`, `info`, `warn`, `error`, `fatal` |
| `GRADIENT_WORKER_CONCURRENCY`      | No       | `2`     | Number of concurrent job processors                           |
| `GRADIENT_JOB_MAX_RETRIES`         | No       | `3`     | Maximum retry attempts before marking job as failed           |
| `GRADIENT_WORKER_POLL_INTERVAL_MS` | No       | `1000`  | Polling interval in milliseconds (min 100ms)                  |

## Redis Key Patterns

### Queue Keys

- `gradient:queue` - List of pending job IDs
- `gradient:processing` - List of job IDs currently being processed
- `gradient:delayed` - Sorted set of job IDs waiting for retry (score = retry timestamp)
- `gradient:job:{jobId}` - Job data (24-hour TTL)

### Metadata Keys

- `gradient:{storageKey}` - Gradient result storage (30-day TTL)

## Job Data Schema

Jobs are enqueued with the following structure:

```json
{
  "guildId": "123456789",
  "galleryName": "my-gallery",
  "storageKey": "my-gallery/uploads/2024-01-15/image.jpg",
  "itemId": "my-gallery-uploads-2024-01-15-image-jpg"
}
```

## Output Data

Successful gradient generation produces:

```json
{
  "status": "completed",
  "gradient": {
    "palette": ["#AABBCC", "#DDEEFF", ...],
    "primary": "#AABBCC",
    "secondary": "#DDEEFF",
    "foreground": "#FFFFFF",
    "css": "linear-gradient(135deg, #AABBCC 0%, #DDEEFF 100%)",
    "blurDataUrl": "data:image/jpeg;base64,..."
  },
  "attempts": 1,
  "createdAt": 1705315200000,
  "updatedAt": 1705315201000
}
```

## Usage

### Development

```bash
# Install dependencies
pnpm install

# Run directly with tsx
REDIS_URL=redis://localhost:6379/0 \
S3_ENDPOINT=http://localhost:9000 \
S3_ACCESS_KEY=minioadmin \
S3_SECRET_KEY=minioadmin \
MASTER_BUCKET_NAME=galleries \
pnpm start

# Build for production
pnpm build

# Run built version
REDIS_URL=redis://localhost:6379/0 \
S3_ENDPOINT=http://localhost:9000 \
S3_ACCESS_KEY=minioadmin \
S3_SECRET_KEY=minioadmin \
MASTER_BUCKET_NAME=galleries \
node dist/index.js

# Run tests
pnpm test
```

### Docker

```bash
# Build the image (from repo root)
docker build -f packages/worker-gradient/Dockerfile -t worker-gradient .

# Run the container
docker run -d \
  --name gradient-worker \
  -e REDIS_URL=redis://user:pass@redis:6379/0 \
  -e S3_ENDPOINT=http://minio:9000 \
  -e S3_ACCESS_KEY=minioadmin \
  -e S3_SECRET_KEY=minioadmin \
  -e MASTER_BUCKET_NAME=galleries \
  -e LOG_LEVEL=info \
  -e GRADIENT_WORKER_CONCURRENCY=4 \
  worker-gradient
```

## Architecture

### Job Flow

1. **Enqueue**: API server creates a job and pushes the job ID to `gradient:queue`
2. **Acquire**: Worker atomically moves job from `gradient:queue` to `gradient:processing`
3. **Process**: Worker downloads image from S3, generates gradient, stores result
4. **Complete**: Worker removes job from `gradient:processing` and deletes job data
5. **Retry (on failure)**: Worker adds job to `gradient:delayed` sorted set with backoff timestamp

### Concurrency Control

The worker uses a simple concurrency limiter:

- Tracks active job count in memory
- Only acquires new jobs when below `GRADIENT_WORKER_CONCURRENCY`
- Uses Redis `LMOVE` for atomic job acquisition

### Retry Strategy

Failed jobs use exponential backoff:

- 1st retry: 2 seconds
- 2nd retry: 4 seconds
- 3rd retry: 8 seconds
- After max retries: job marked as permanently failed

### Graceful Shutdown

On SIGINT/SIGTERM:

1. Stop acquiring new jobs
2. Wait for active jobs to complete
3. Move any remaining processing jobs back to queue
4. Close Redis connection

## Logging

All logs are output as JSON to stdout with the following base fields:

- `service`: `photo-gallery-worker-gradient`
- `level`: Log level string
- `time`: ISO 8601 timestamp

Example log output:

```json
{"level":"info","time":"2024-01-15T10:30:00.000Z","service":"photo-gallery-worker-gradient","msg":"Initializing gradient generator worker"}
{"level":"info","time":"2024-01-15T10:30:01.000Z","service":"photo-gallery-worker-gradient","concurrency":2,"msg":"Worker started"}
{"level":"info","time":"2024-01-15T10:30:02.000Z","service":"photo-gallery-worker-gradient","jobId":"gradient-test-image.jpg","storageKey":"test/image.jpg","processingTimeMs":234,"primary":"#AABBCC","secondary":"#DDEEFF","msg":"Job completed successfully"}
```

## Integration with API Server

The gradient worker is designed to run as a standalone service, but can also be imported as a library for in-process usage:

```typescript
import { GradientWorker, parseEnv, createLogger } from "worker-gradient";
import { redisClient } from "utils/redis";

const env = parseEnv();
const logger = createLogger(env);
const worker = new GradientWorker(redisClient, logger, env);

// Start processing
worker.start();

// Enqueue a job
await worker.enqueueJob({
  guildId: "123456789",
  galleryName: "my-gallery",
  storageKey: "path/to/image.jpg",
  itemId: "unique-item-id",
});

// Stop when done
await worker.stop();
```

## Monitoring

The worker exposes metrics through the `getStats()` method:

```typescript
const stats = worker.getStats();
// {
//   jobsProcessed: 42,
//   jobsFailed: 2,
//   activeJobs: 1,
//   isRunning: true,
//   avgProcessingTimeMs: 234.5,
//   totalProcessingTimeMs: 9858
// }
```

Additional queue metrics can be obtained:

```typescript
const queueLength = await worker.getQueueLength();
const processingCount = await worker.getProcessingCount();
const delayedCount = await worker.getDelayedCount();
```
