import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import type { Express } from "express";
import helmet from "helmet";
import hpp from "hpp";
import env, { parsedCorsOrigins } from "../schemas/env.ts";

interface CSPDirectives {
  [key: string]: string[];
  defaultSrc: string[];
  scriptSrc: string[];
  styleSrc: string[];
  connectSrc: string[];
  imgSrc: string[];
  fontSrc: string[];
  frameSrc: string[];
  objectSrc: string[];
}

function getCSPDirectives(isDevelopment: boolean): CSPDirectives {
  if (isDevelopment) {
    // Development: More permissive for HMR and fast refresh
    return {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-eval'", // Vite HMR requires this in dev
        "'unsafe-inline'", // React dev tools may need this
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'", // Emotion/Chakra generates inline styles
      ],
      connectSrc: [
        "'self'",
        "ws://localhost:*", // Vite HMR WebSocket
        "ws://*", // Allow WebSocket connections in dev
      ],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "data:"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    };
  }

  // Production: Strict and secure
  return {
    defaultSrc: ["'self'"],
    scriptSrc: [
      "'self'",
      // Add nonce-based scripts if needed (see below)
    ],
    styleSrc: [
      "'self'",
      "'nonce-{NONCE}'", // For inline styles - implement nonce generation
    ],
    connectSrc: [
      "'self'",
      // Add any external APIs your app calls
    ],
    imgSrc: ["'self'", "data:", "https:"],
    fontSrc: ["'self'", "data:"],
    frameSrc: ["'none'"],
    objectSrc: ["'none'"],
  };
}

export function applySecurity(app: Express) {
  // Behind a reverse proxy (e.g., Nginx, Cloudflare, Fly, Render):
  app.set("trust proxy", 1);

  // Hide framework
  app.disable("x-powered-by");

  // Basic hardening
  app.use(
    helmet({
      contentSecurityPolicy:
        process.env.NODE_ENV === "production"
          ? {
              directives: getCSPDirectives(false),
            }
          : false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: {
        policy: "cross-origin",
      },
    }),
  );

  const hardenedHeaders: Record<string, string> = {
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Opener-Policy": "same-origin",
  };

  // Cloudflare terminates TLS first, but we still enforce the headers once traffic hits Express.
  app.use((_, res, next) => {
    Object.entries(hardenedHeaders).forEach(([header, value]) => {
      if (!res.getHeader(header)) {
        res.setHeader(header, value);
      }
    });
    next();
  });

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
