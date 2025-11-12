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
  SESSION_SECRET: z.string(),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  CORS_CREDENTIALS: z.coerce.boolean().default(false),
  JSON_LIMIT: z.string().default("1mb"),
  URLENCODED_LIMIT: z.string().default("1mb"),
  COOKIE_SECRET: z.string().min(16).optional(),
  ADMIN_USER_IDS: z.string().transform((val) =>
    val
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  ),
});

export type Env = z.infer<typeof envSchema>;

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("Invalid environment variables:", parsedEnv.error.message);
  process.exit(1);
}

export function parsedCorsOrigins(): (string | RegExp)[] | "*" {
  if (env.CORS_ORIGINS.trim() === "*") return "*";
  return env.CORS_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const env = parsedEnv.data;

export default env;
