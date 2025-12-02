# Gallery Expiration Notification Worker

An ephemeral worker that sends Discord webhook notifications for galleries approaching expiration. Designed to run as a scheduled container triggered by an external scheduler (e.g., Coolify, Kubernetes CronJob).

## Features

- Scans all guilds with notification settings enabled
- Finds galleries expiring in a configurable number of days
- Sends Discord webhook embed notifications with gallery details
- Idempotent: duplicate notifications are never sent for the same event
- Handles permanent webhook errors (404/410) gracefully by marking webhooks as invalid
- Structured JSON logging suitable for log aggregation (Loki, etc.)
- Zero runtime state; designed for ephemeral container execution

## Environment Variables

| Variable              | Required | Default | Description                                                   |
| --------------------- | -------- | ------- | ------------------------------------------------------------- |
| `REDIS_URL`           | Yes      | -       | Redis connection URL (e.g., `redis://user:pass@host:6379/0`)  |
| `LOG_LEVEL`           | No       | `info`  | Log level: `trace`, `debug`, `info`, `warn`, `error`, `fatal` |
| `DEFAULT_DAYS_BEFORE` | No       | `7`     | Default days before expiration to notify (1-30)               |

## Redis Key Patterns

### Read Keys

- `guilds:{guildId}:settings` - Guild notification settings (JSON)
- `guild:{guildId}:galleries` - Set of gallery names for a guild
- `guild:{guildId}:gallery:{galleryName}:meta` - Gallery metadata (JSON)

### Write Keys

- `guilds:{guildId}:notified:{galleryName}:{daysBefore}` - Notification record for idempotency (30-day TTL)

## Guild Settings Schema

Guild settings must be stored at `guilds:{guildId}:settings` with the following structure:

```json
{
  "notifications": {
    "enabled": true,
    "webhookUrl": "https://discord.com/api/webhooks/...",
    "daysBefore": 7,
    // The following fields are added by the worker when a webhook fails (optional)
    "webhookInvalid": true,
    "webhookErrorCode": 404,
    "webhookErrorAt": 1704067200000
  }
}
```

## Usage

### Development

```bash
# Install dependencies
pnpm install

# Run directly with tsx
REDIS_URL=redis://localhost:6379/0 pnpm start

# Build for production
pnpm build

# Run built version
REDIS_URL=redis://localhost:6379/0 node dist/index.js
```

### Docker

```bash
# Build the image (from repo root)
docker build -f packages/worker-notifications/Dockerfile -t gallery-notification-worker .

# Run the container
docker run --rm \
  -e REDIS_URL=redis://user:pass@redis:6379/0 \
  -e LOG_LEVEL=info \
  gallery-notification-worker
```

## Exit Codes

- `0` - Success: worker completed without fatal errors
- `1` - Failure: fatal error occurred (Redis connection failed, etc.)

## Logging

All logs are output as JSON to stdout with the following base fields:

- `service`: `photo-gallery-notification-worker`
- `level`: Log level string
- `time`: ISO 8601 timestamp

Example log output:

```json
{"level":"info","time":"2024-01-15T10:30:00.000Z","service":"photo-gallery-notification-worker","msg":"Starting notification worker run"}
{"level":"info","time":"2024-01-15T10:30:01.000Z","service":"photo-gallery-notification-worker","guildCount":5,"msg":"Discovered guilds"}
{"level":"info","time":"2024-01-15T10:30:02.000Z","service":"photo-gallery-notification-worker","stats":{"guildsProcessed":5,"galleriesChecked":42,"notificationsSent":3,"notificationsSkipped":0,"webhookErrors":0,"invalidWebhooksMarked":0},"msg":"Notification worker run completed"}
```

## Scheduling

This worker is designed to be triggered by an external scheduler. Example configurations:

### Coolify

Configure a scheduled job to run the container daily.

### Kubernetes CronJob

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: gallery-notification-worker
spec:
  schedule: "0 9 * * *" # Run daily at 9 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: worker
              image: gallery-notification-worker:latest
              env:
                - name: REDIS_URL
                  valueFrom:
                    secretKeyRef:
                      name: redis-credentials
                      key: url
          restartPolicy: OnFailure
```
