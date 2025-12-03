import { Command } from "@commander-js/extra-typings";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CoolifyClient } from "./coolify.js";
import { parseEnv } from "./env.js";
import { createLogger } from "./logger.js";
import { parseManifest } from "./manifest.js";
import { Reconciler } from "./reconciler.js";

/**
 * Creates the root program with global options.
 */
export async function createProgram() {
  const pkg = await readFile(new URL("../package.json", import.meta.url), "utf-8").then(JSON.parse);

  const program = new Command()
    .name("resource-reconciler")
    .description("CLI to reconcile Coolify resources from a manifest file")
    .version(pkg.version)
    .option(
      "-m, --manifest <path>",
      "Path to coolify.manifest.json file",
      process.env.MANIFEST_PATH,
    )
    .option("-s, --server-uuid <uuid>", "Coolify server UUID (overrides manifest)")
    .option("-d, --dry-run", "Run without making changes", process.env.DRY_RUN === "true");

  return program;
}

export type ProgramOptions = ReturnType<Awaited<ReturnType<typeof createProgram>>["opts"]>;

/**
 * Creates the 'apply' subcommand.
 */
export function createApplyCommand() {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  const command = new Command<[], {}, ProgramOptions>("apply")
    .description("Apply the configuration from the manifest to Coolify")
    .option(
      "-t, --tag <tag>",
      'Docker image tag to deploy (e.g., "latest" or "v1.0.0")',
      process.env.DOCKER_IMAGE_TAG || "latest",
    )
    .action(async (options, command) => {
      const globalOptions = command.optsWithGlobals();

      const env = parseEnv();
      const logger = createLogger(env);

      const manifestPath = globalOptions.manifest;
      if (!manifestPath) {
        logger.fatal({}, "Manifest path is required. Use --manifest or MANIFEST_PATH env var.");
        process.exit(1);
      }

      const dockerTag = options.tag;
      if (!dockerTag) {
        logger.fatal({}, "Docker image tag is required. Use --tag or DOCKER_IMAGE_TAG env var.");
        process.exit(1);
      }

      const dryRun = globalOptions.dryRun;

      logger.info({ manifestPath, dockerTag, dryRun }, "Starting Coolify resource reconciler");

      try {
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

        const client = new CoolifyClient(
          env.COOLIFY_ENDPOINT_URL,
          env.COOLIFY_TOKEN,
          logger,
          dryRun,
        );

        const reconciler = new Reconciler(client, logger, {
          manifest,
          dockerTag,
          envSecrets: {
            COOLIFY_ENV_SERVER: env.COOLIFY_ENV_SERVER ?? "",
            COOLIFY_ENV_CLIENT: env.COOLIFY_ENV_CLIENT ?? "",
            COOLIFY_ENV_GRADIENT_WORKER: env.COOLIFY_ENV_GRADIENT_WORKER ?? "",
            COOLIFY_ENV_EXPIRATION_WORKER: env.COOLIFY_ENV_EXPIRATION_WORKER ?? "",
          },
          serverUuid: globalOptions.serverUuid,
        });

        const result = await reconciler.reconcile();

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
    });

  return command;
}

/**
 * Creates the 'state' subcommand.
 */
export function createStateCommand() {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  const command = new Command<[], {}, ProgramOptions>("state")
    .description("Get the current state of resources from the manifest")
    .action(async (_options, command) => {
      const globalOptions = command.optsWithGlobals();

      const env = parseEnv();
      // Mute logger for state command to only output JSON
      // @ts-expect-error TS2322 - createLogger infers LOG_LEVEL as string literal
      const logger = createLogger({ ...env, LOG_LEVEL: "silent" });

      const manifestPath = globalOptions.manifest;
      if (!manifestPath) {
        logger.fatal({}, "Manifest path is required. Use --manifest or MANIFEST_PATH env var.");
        process.exit(1);
      }

      try {
        const absolutePath = resolve(process.cwd(), manifestPath);
        const manifestContent = await readFile(absolutePath, "utf-8");
        const manifestData = JSON.parse(manifestContent);
        const manifest = parseManifest(manifestData);

        if (globalOptions.dryRun) {
          const resourceNames = manifest.resources.map((r) => r.name).join(", ");
          console.log(
            `[DRY RUN] Would introspect environment '${manifest.environmentName}' in project '${manifest.projectId}' for the following resources: ${resourceNames}`,
          );
          process.exit(0);
        }

        const client = new CoolifyClient(
          env.COOLIFY_ENDPOINT_URL,
          env.COOLIFY_TOKEN,
          logger,
          globalOptions.dryRun,
        );

        const allowedKeys = new Set([
          "exists",
          "uuid",
          "name",
          "docker_registry_image_name",
          "docker_registry_image_tag",
          "fqdn",
          "health_check_enabled",
          "health_check_host",
          "health_check_interval",
          "health_check_method",
          "health_check_path",
          "health_check_port",
          "health_check_response_text",
          "health_check_retries",
          "health_check_return_code",
          "health_check_scheme",
          "health_check_start_period",
          "health_check_timeout",
          "last_online_at",
          "last_restart_at",
          "last_restart_type",
          "ports_exposes",
          "restart_count",
          "status",
          "created_at",
          "updated_at",
        ]);

        const resourceStates = [];
        for (const resource of manifest.resources) {
          const app = await client.findApplicationByName(resource.name);
          if (app) {
            const filtered: Record<string, unknown> = { exists: true };
            for (const key of allowedKeys) {
              if (key !== "exists" && key in app) {
                filtered[key] = (app as unknown as Record<string, unknown>)[key];
              }
            }
            resourceStates.push(filtered);
          } else {
            resourceStates.push({
              name: resource.name,
              exists: false,
            });
          }
        }

        // Output the state as JSON
        console.log(JSON.stringify(resourceStates, null, 2));
        process.exit(0);
      } catch (error) {
        logger.fatal(
          { error: error instanceof Error ? error.message : String(error) },
          "Fatal error during state retrieval",
        );
        process.exit(1);
      }
    });

  return command;
}

/**
 * Assembles the final program with all subcommands.
 */
export async function assembleProgram() {
  const program = await createProgram();
  const applyCommand = createApplyCommand();
  const stateCommand = createStateCommand();
  program.addCommand(applyCommand);
  program.addCommand(stateCommand);
  return program;
}
