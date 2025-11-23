import express from "express";
import session from "express-session";
import { errorHandler, notFoundHandler } from "./middleware/errors.ts";
import { httpLogger } from "./middleware/logger.ts";
import { setupMetrics } from "./middleware/metrics.ts";
import { apiRateLimiter, authRateLimiter } from "./middleware/rateLimit.ts";
import { applySecurity } from "./middleware/security.ts";
import redis from "./redis.ts";
import routers from "./routers.ts";
import env from "./schemas/env.ts";
import { generateSessionId } from "./utils.ts";

/*
 * Recursively prints the registered routes of an Express router.
 *
 * @param {Array} routerStack - The stack of middleware and routes from an Express router.
 * @param {string} [parentPath=''] - The parent path to prepend to the route paths.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const printRegisteredRoutes = (routerStack: any[], parentPath = "") => {
  routerStack.forEach((middleware) => {
    if (middleware.route) {
      console.debug(
        middleware.route.stack[0].method.toUpperCase(),
        `${parentPath && parentPath !== "undefined" ? parentPath : ""}${middleware.route.path}`,
      );
    } else if (middleware.name === "router") {
      printRegisteredRoutes(
        middleware.handle.stack,
        `${parentPath && parentPath !== "undefined" ? parentPath : ""}${middleware.path}`,
      );
    }
  });
};

export const createApp = () => {
  const app = express();

  // Logging (first to capture early failures)
  app.use(httpLogger);

  // Parsers with limits
  app.use(express.json({ limit: env.JSON_LIMIT }));
  app.use(express.urlencoded({ extended: false, limit: env.URLENCODED_LIMIT }));

  // Security / hardening middleware
  applySecurity(app);

  // Metrics (Prometheus)
  setupMetrics(app);

  // Session management
  const sess: session.SessionOptions = {
    store: redis.store,
    genid: () => {
      return generateSessionId();
    },
    resave: false,
    saveUninitialized: false,
    secret: env.SESSION_SECRET,
    cookie: {
      httpOnly: true,
      sameSite: env.COOKIE_SAMESITE ?? (env.NODE_ENV === "production" ? "none" : "lax"),
      secure: env.COOKIE_SECURE ?? env.NODE_ENV === "production",
    },
  };

  if (env.NODE_ENV === "production" || env.TRUST_PROXY) {
    let trustProxy: number | string | boolean = 1;
    if (env.TRUST_PROXY) {
      if (env.TRUST_PROXY.toLowerCase() === "true") trustProxy = true;
      else if (env.TRUST_PROXY.toLowerCase() === "false") trustProxy = false;
      else if (!Number.isNaN(Number(env.TRUST_PROXY))) trustProxy = Number(env.TRUST_PROXY);
      else trustProxy = env.TRUST_PROXY;
    }
    app.set("trust proxy", trustProxy);

    if (env.SESSION_COOKIE_DOMAIN && sess.cookie) {
      sess.cookie.domain = env.SESSION_COOKIE_DOMAIN;
    }
  }

  app.use(session(sess));

  app.use(routers.healthRouter);

  // API routes with scoped rate limits
  app.use("/api/auth", authRateLimiter);
  app.use("/api", routers.authRouter);
  app.use("/api", apiRateLimiter, routers.galleryRouter);
  app.use("/api", apiRateLimiter, routers.guildRouter);

  // 404 and centralized error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
