import { z } from "zod";

export const envSchema = z.object({
  // Coolify API base URL (required)
  COOLIFY_API_URL: z.string().url().describe("Coolify API base URL"),
  // Coolify API token (required)
  COOLIFY_TOKEN: z.string().min(1).describe("Coolify API token"),
  // Path to the manifest file (required when running CLI)
  MANIFEST_PATH: z.string().min(1).optional(),
  // Docker image tag to deploy (required when running CLI)
  DOCKER_IMAGE_TAG: z.string().min(1).optional(),
  // Environment file content (parsed from GitHub secret)
  ENV_FILE_CONTENT: z.string().optional(),
  // Log level for pino logger
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  // Dry run mode - only log actions without making changes
  DRY_RUN: z
    .string()
    .optional()
    .transform((val) => val === "true" || val === "1"),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const errors = parsed.error.flatten();
    // Output JSON for consistency with the rest of the worker logs
    console.error(
      JSON.stringify({
        level: "fatal",
        service: "photo-gallery-reconciler",
        msg: "Invalid environment variables",
        errors,
      }),
    );
    process.exit(1);
  }

  return parsed.data;
}
