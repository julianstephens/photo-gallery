import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import type { Express } from "express";
import helmet from "helmet";
import hpp from "hpp";
import env, { parsedCorsOrigins } from "../schemas/env.ts";

export function applySecurity(app: Express) {
  // Behind a reverse proxy (e.g., Nginx, Cloudflare, Fly, Render):
  app.set("trust proxy", 1);

  // Hide framework
  app.disable("x-powered-by");

  // Basic hardening
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: {
        policy: "cross-origin",
      },
    }),
  );

  // Parameter pollution protection
  app.use(hpp());

  // CORS (configure credentials + origins as needed)
  const origins = parsedCorsOrigins();
  app.use(
    cors({
      origin: origins,
      credentials: env.CORS_CREDENTIALS,
      exposedHeaders: ["x-request-id", "etag"],
    }),
  );

  // Cookies (signed if secret present)
  if (env.COOKIE_SECRET) {
    app.use(cookieParser(env.COOKIE_SECRET));
  } else {
    app.use(cookieParser());
  }

  // Response compression
  app.use(
    compression({
      threshold: 1024, // compress responses >1KB
    }),
  );
}
