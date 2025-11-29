import dotenv from "dotenv";
import { z } from "zod";
dotenv.config();

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  PORT: z
    .string()
    .default("4000")
    .transform((val) => parseInt(val, 10)),
  S3_ENDPOINT: z.url(),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  MASTER_BUCKET_NAME: z.string(),
  DISCORD_API_URL: z.string().default("https://discord.com/api/v10"),
  DISCORD_CLIENT_ID: z.string(),
  DISCORD_CLIENT_SECRET: z.string(),
  DISCORD_REDIRECT_URI: z.string(),
  CLIENT_URL: z.string().default("http://localhost:3000"),
  REDIS_HOST: z.string(),
  REDIS_PORT: z
    .string()
    .default("6379")
    .transform((val) => parseInt(val, 10)),
  REDIS_USER: z.string(),
  REDIS_PASSWORD: z.string(),
  REDIS_DB: z
    .string()
    .default("1")
    .transform((val) => parseInt(val, 10)),
  SESSION_SECRET: z.string(),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  CORS_CREDENTIALS: z.coerce.boolean().default(true),
  JSON_LIMIT: z.string().default("1mb"),
  URLENCODED_LIMIT: z.string().default("1mb"),
  COOKIE_SECRET: z.string().min(16).optional(),
  COOKIE_SECURE: z.coerce.boolean().optional(),
  COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).optional(),
  SESSION_COOKIE_DOMAIN: z.string().optional(),
  TRUST_PROXY: z.string().optional(),
  ADMIN_USER_IDS: z.string().transform((val) =>
    val
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  ),
  // Gradient worker feature flag and configuration
  GRADIENT_WORKER_ENABLED: z.coerce.boolean().default(false),
  GRADIENT_WORKER_CONCURRENCY: z
    .string()
    .default("2")
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val > 0, "Must be a positive integer"),
  GRADIENT_JOB_MAX_RETRIES: z
    .string()
    .default("3")
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val > 0, "Must be a positive integer"),
  GRADIENT_WORKER_POLL_INTERVAL_MS: z
    .string()
    .default("1000")
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val >= 100, "Must be at least 100ms"),
  // Logging configuration
  // stdout: JSON logs to stdout/stderr (default for production)
  // file: Rotating file logs (default for development)
  // both: stdout + file (useful for debugging)
  LOG_OUTPUT: z.enum(["stdout", "file", "both"]).optional(),
  // TODO: Add LOKI_URL and Loki logging support if/when direct Loki push is implemented.
  // Log file rotation settings (for file-based logging)
  LOG_FILE_PATH: z.string().default("logs/app.log"),
  LOG_FILE_MAX_SIZE: z
    .string()
    .default("10M")
    .refine(
      (val) => /^\d+[KMG]$/.test(val),
      "Must be a valid size format (e.g., '10M', '100K', '1G')",
    ), // rotating-file-stream size format
  LOG_FILE_MAX_FILES: z
    .string()
    .default("7")
    .transform((val) => parseInt(val, 10)), // days of retention
});

export type Env = z.infer<typeof envSchema>;

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("Invalid environment variables:", parsedEnv.error.message);
  process.exit(1);
}

export function parsedCorsOrigins(): (string | RegExp)[] | "*" {
  if (env.CORS_ORIGINS.trim() === "*") return "*";
  const origins = env.CORS_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  console.log("Parsed CORS origins:", origins);
  return origins;
}

const env = parsedEnv.data;

export default env;
