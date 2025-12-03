# Worker Resource Reconciler

A Coolify resource reconciler for managing Docker-based application deployments. This package acts as a lightweight Infrastructure as Code (IaC) tool that reads a declarative manifest (`coolify.manifest.json`) and ensures applications are defined and deployed on Coolify.

## Features

- **Declarative Deployment**: Define your applications in a JSON manifest and let the reconciler handle creation, updates, and deployments.
- **Docker Image Support**: Works with prebuilt Docker images from container registries like GHCR.
- **Environment Variable Management**: Parse `.env` formatted secrets and apply them to applications.
- **Structured Logging**: All operations are logged in JSON format with `service: photo-gallery-reconciler`.
- **Dry Run Mode**: Test your deployments without making actual changes.
- **Idempotent**: Safe to run multiple times; creates new applications or updates existing ones as needed.

## Installation

```bash
pnpm add worker-resource-reconciler
```

Or use it directly from the monorepo:

```bash
pnpm --filter worker-resource-reconciler build
node packages/worker-resource-reconciler/dist/cli.js --help
```

## Usage

### CLI

```bash
# Basic usage
resource-reconciler apply --manifest ./coolify.manifest.json --tag v1.0.0

# With dry run
resource-reconciler apply -m ./coolify.manifest.json -t latest --dry-run

# Using environment variables
COOLIFY_ENDPOINT_URL=https://coolify.example.com \
COOLIFY_TOKEN=your-api-token \
MANIFEST_PATH=./coolify.manifest.json \
DOCKER_IMAGE_TAG=v1.0.0 \
resource-reconciler apply
```

### Environment Variables

| Variable               | Required | Description                                                              |
| ---------------------- | -------- | ------------------------------------------------------------------------ |
| `COOLIFY_ENDPOINT_URL` | Yes      | Coolify server base URL                                                  |
| `COOLIFY_TOKEN`        | Yes      | Coolify API token                                                        |
| `MANIFEST_PATH`        | No       | Path to manifest file (can use CLI arg)                                  |
| `DOCKER_IMAGE_TAG`     | No       | Docker image tag to deploy (can use CLI arg)                             |
| `COOLIFY_ENV_*`        | No       | `.env` formatted content for an application (e.g., `COOLIFY_ENV_SERVER`) |
| `LOG_LEVEL`            | No       | Log level: trace, debug, info, warn, error, fatal (default: info)        |
| `DRY_RUN`              | No       | Set to "true" for dry run mode                                           |

### Manifest Format

Create a `coolify.manifest.json` file in your repository root:

```json
{
  "projectId": "your-coolify-project-uuid",
  "destinationId": "your-coolify-destination-uuid",
  "serverUuid": "your-coolify-server-uuid",
  "environmentName": "production",
  "resources": [
    {
      "name": "photo-gallery-server",
      "description": "The server service.",
      "dockerImageName": "ghcr.io/owner/photo-gallery-server",
      "envSecretName": "COOLIFY_ENV_SERVER",
      "domains": "api.example.com",
      "portsExposes": "4000",
      "healthCheck": {
        "path": "/health",
        "port": "4000"
      }
    },
    {
      "name": "photo-gallery-client",
      "description": "The client service.",
      "dockerImageName": "ghcr.io/owner/photo-gallery-client",
      "domains": "app.example.com",
      "portsExposes": "80",
      "healthCheck": {
        "path": "/",
        "port": "80"
      }
    }
  ]
}
```

### Generating a Manifest

Use the included scaffolding script to generate a manifest from your monorepo:

```bash
pnpm tsx ./scripts/generate-manifest.ts
```

This scans all workspaces with Dockerfiles and generates a `coolify.manifest.json` with placeholder values.

## Reconciliation Logic

For each resource in the manifest:

1. **Lookup**: Search for an existing application by name
2. **Create or Update**:
   - If not found: Create a new Docker image application using Coolify's API
   - If found: Update the application with the new Docker image tag and configuration
3. **Environment Variables**: Parse and apply environment variables from the `.env` content
4. **Deploy**: Trigger a deployment via the Coolify API

## Library Usage

You can also use this package as a library:

```typescript
import { CoolifyClient, Reconciler, parseManifest, parseEnvFile } from "worker-resource-reconciler";

// Parse manifest
const manifest = parseManifest(manifestData);

// Create client
const client = new CoolifyClient(apiUrl, token, logger, dryRun);

// Create and run reconciler
const reconciler = new Reconciler(client, logger, {
  manifest,
  dockerTag: "v1.0.0",
  envSecrets: {
    COOLIFY_ENV_SERVER: "...",
    COOLIFY_ENV_CLIENT: "...",
  },
});

const result = await reconciler.reconcile();
console.log(result.success, result.totalCreated, result.totalUpdated);
```

## Development

```bash
# Build
pnpm --filter worker-resource-reconciler build

# Test
pnpm --filter worker-resource-reconciler test

# Lint
pnpm --filter worker-resource-reconciler lint
```

## GitHub Actions Integration

The reconciler integrates with GitHub Actions in the `deploy.yml` workflow:

```yaml
- name: Run resource reconciler
  env:
    COOLIFY_ENDPOINT_URL: ${{ secrets.COOLIFY_ENDPOINT_URL }}
    COOLIFY_TOKEN: ${{ secrets.COOLIFY_TOKEN }}
    COOLIFY_ENV_SERVER: ${{ secrets.COOLIFY_ENV_SERVER }}
    COOLIFY_ENV_CLIENT: ${{ secrets.COOLIFY_ENV_CLIENT }}
    MANIFEST_PATH: ./coolify.manifest.json
    DOCKER_IMAGE_TAG: latest
  run: |
    node packages/worker-resource-reconciler/dist/cli.js apply \
      --manifest "$MANIFEST_PATH" \
      --tag "$DOCKER_IMAGE_TAG"
```

## Required GitHub Secrets

| Secret                 | Description                                                   |
| ---------------------- | ------------------------------------------------------------- |
| `COOLIFY_ENDPOINT_URL` | Coolify server base URL (e.g., `https://coolify.example.com`) |
| `COOLIFY_TOKEN`        | Coolify API token (from Keys & Tokens in Coolify dashboard)   |
| `PRODUCTION_ENV_FILE`  | `.env` formatted content for production environment variables |
