import { z } from "zod";

export const envSchema = z.object({
  // Redis connection URL (required)
  REDIS_URL: z
    .string()
    .url()
    .refine(
      (url) => url.startsWith("redis://") || url.startsWith("rediss://"),
      "REDIS_URL must start with redis:// or rediss://",
    ),

  // Log level for pino logger
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),

  // Default number of days before expiration to notify
  DEFAULT_DAYS_BEFORE: z
    .string()
    .default("7")
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val >= 1 && val <= 30, "Must be between 1 and 30"),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    console.error("Invalid environment variables:", JSON.stringify(errors, null, 2));
    process.exit(1);
  }

  return parsed.data;
}
