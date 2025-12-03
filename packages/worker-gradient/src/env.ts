import { z } from "zod";

export const envSchema = z.object({
  // Redis connection URL (required)
  REDIS_URL: z
    .url()
    .refine(
      (url) => url.startsWith("redis://") || url.startsWith("rediss://"),
      "REDIS_URL must start with redis:// or rediss://",
    ),
  // Log level for pino logger
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  // S3/Object storage configuration
  S3_ENDPOINT: z.url(),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  MASTER_BUCKET_NAME: z.string().min(1),
  // Worker configuration
  GRADIENT_WORKER_CONCURRENCY: z
    .string()
    .default("2")
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val > 0, "Must be a positive integer"),
  GRADIENT_JOB_MAX_RETRIES: z
    .string()
    .default("3")
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val >= 0, "Must be a non-negative integer"),
  GRADIENT_WORKER_POLL_INTERVAL_MS: z
    .string()
    .default("1000")
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val >= 100, "Must be at least 100ms"),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const errors = z.treeifyError(parsed.error).errors;
    // Output JSON for consistency with the rest of the worker logs
    console.error(
      JSON.stringify({
        level: "fatal",
        service: "photo-gallery-worker-gradient",
        msg: "Invalid environment variables",
        errors,
      }),
    );
    process.exit(1);
  }

  return parsed.data;
}
