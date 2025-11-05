import { z } from "zod";
import dotenv from "dotenv";
dotenv.config();

export const envSchema = z.object({
  PORT: z.string().default("4000"),
  COCKPIT_API_URL: z.string().default("https://api.cockpit.gg/v1"),
  COCKPIT_TOKEN: z.string().default("xxx"),
  COCKPIT_PUBLIC_ASSETS_BASE: z.string().optional(),
  MINIO_ENDPOINT: z.string(),
  MINIO_PORT: z.number().min(1).max(65535),
  MINIO_ACCESS_KEY: z.string(),
  MINIO_SECRET_KEY: z.string(),
  DISCORD_CLIENT_ID: z.string(),
  DISCORD_CLIENT_SECRET: z.string(),
  DISCORD_REDIRECT_URI: z.string(),
});

export type Env = z.infer<typeof envSchema>;

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("Invalid environment variables:", parsedEnv.error.message);
  process.exit(1);
}

const env = parsedEnv.data;

export default env;
