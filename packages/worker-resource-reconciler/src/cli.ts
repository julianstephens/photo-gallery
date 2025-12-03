import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CoolifyClient } from "./coolify.js";
import { parseEnv } from "./env.js";
import { createLogger } from "./logger.js";
import { parseManifest } from "./manifest.js";
import { Reconciler } from "./reconciler.js";

/**
 * Parses command line arguments.
 * Supports:
 *   --manifest <path>    Path to manifest file
 *   --tag <tag>          Docker image tag to deploy
 *   --server-uuid <uuid> Coolify server UUID (optional, can be in manifest)
 *   --dry-run            Run without making changes
 *   --help               Show help
 */
function parseArgs(): {
  manifestPath?: string;
  dockerTag?: string;
  serverUuid?: string;
  dryRun: boolean;
  help: boolean;
} {
  const args = process.argv.slice(2);
  const result = {
    manifestPath: undefined as string | undefined,
    dockerTag: undefined as string | undefined,
    serverUuid: undefined as string | undefined,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--manifest":
      case "-m":
        if (i + 1 >= args.length || args[i + 1].startsWith("-")) {
          console.error("Error: --manifest requires a path argument.");
          process.exit(1);
        }
        result.manifestPath = args[++i];
        break;
      case "--tag":
      case "-t":
        if (i + 1 >= args.length || args[i + 1].startsWith("-")) {
          console.error("Error: --tag requires a tag argument.");
          process.exit(1);
        }
        result.dockerTag = args[++i];
        break;
      case "--server-uuid":
      case "-s":
        if (i + 1 >= args.length || args[i + 1].startsWith("-")) {
          console.error("Error: --server-uuid requires a UUID argument.");
          process.exit(1);
        }
        result.serverUuid = args[++i];
        break;
      case "--dry-run":
      case "-d":
        result.dryRun = true;
        break;
      case "--help":
      case "-h":
        result.help = true;
        break;
    }
  }

  return result;
}

function printUsage(): void {
  console.log(`
Usage: resource-reconciler [options]

Options:
  --manifest, -m <path>      Path to coolify.manifest.json file
  --tag, -t <tag>            Docker image tag to deploy (e.g., "latest" or "v1.0.0")
  --server-uuid, -s <uuid>   Coolify server UUID (optional if in manifest)
  --dry-run, -d              Run without making changes
  --help, -h                 Show this help message

Environment variables:
  COOLIFY_API_URL            Coolify API base URL (required)
  COOLIFY_TOKEN              Coolify API token (required)
  ENV_FILE_CONTENT           .env formatted content for application env vars
  LOG_LEVEL                  Log level: trace, debug, info, warn, error, fatal
  DRY_RUN                    Set to "true" for dry run mode

Examples:
  resource-reconciler --manifest ./coolify.manifest.json --tag latest
  resource-reconciler -m ./coolify.manifest.json -t v1.0.0 --dry-run
`);
}

async function main(): Promise<void> {
  // Parse CLI arguments
  const args = parseArgs();

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  // Parse and validate environment variables
  const env = parseEnv();

  // Create logger
  const logger = createLogger(env);

  // Determine manifest path
  const manifestPath = args.manifestPath ?? env.MANIFEST_PATH;
  if (!manifestPath) {
    logger.fatal({}, "Manifest path is required. Use --manifest or MANIFEST_PATH env var.");
    process.exit(1);
  }

  // Determine Docker tag
  const dockerTag = args.dockerTag ?? env.DOCKER_IMAGE_TAG;
  if (!dockerTag) {
    logger.fatal({}, "Docker image tag is required. Use --tag or DOCKER_IMAGE_TAG env var.");
    process.exit(1);
  }

  // Determine dry run mode
  const dryRun = args.dryRun || env.DRY_RUN;

  logger.info({ manifestPath, dockerTag, dryRun }, "Starting Coolify resource reconciler");

  try {
    // Read and parse manifest
    const absolutePath = resolve(process.cwd(), manifestPath);
    logger.debug({ path: absolutePath }, "Reading manifest file");

    const manifestContent = await readFile(absolutePath, "utf-8");
    const manifestData = JSON.parse(manifestContent);
    const manifest = parseManifest(manifestData);

    logger.info(
      {
        projectId: manifest.projectId,
        environmentName: manifest.environmentName,
        resourceCount: manifest.resources.length,
      },
      "Manifest loaded successfully",
    );

    // Create Coolify client
    const client = new CoolifyClient(env.COOLIFY_API_URL, env.COOLIFY_TOKEN, logger, dryRun);

    // Create and run reconciler
    const reconciler = new Reconciler(client, logger, {
      manifest,
      dockerTag,
      envFileContent: env.ENV_FILE_CONTENT,
      serverUuid: args.serverUuid,
    });

    const result = await reconciler.reconcile();

    // Log final results
    logger.info(
      {
        success: result.success,
        totalCreated: result.totalCreated,
        totalUpdated: result.totalUpdated,
        totalFailed: result.totalFailed,
        resources: result.resources,
      },
      "Reconciliation complete",
    );

    if (!result.success) {
      logger.error({}, "Reconciliation failed with errors");
      process.exit(1);
    }

    logger.info({}, "All resources reconciled successfully");
    process.exit(0);
  } catch (error) {
    logger.fatal(
      { error: error instanceof Error ? error.message : String(error) },
      "Fatal error during reconciliation",
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      level: "fatal",
      service: "photo-gallery-reconciler",
      msg: "Unhandled error in main",
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exit(1);
});
