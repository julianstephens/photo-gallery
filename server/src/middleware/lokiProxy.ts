import type { Request } from "express";
import { createProxyMiddleware, type Options } from "http-proxy-middleware";
import env from "../schemas/env.ts";
import { appLogger } from "./logger.ts";

/**
 * Default internal Loki endpoint for log ingestion
 */
const DEFAULT_LOKI_TARGET = env.LOKI_PROXY_TARGET ?? "http://loki:3100";

/**
 * Resolved Loki target URL
 */
const LOKI_TARGET = env.LOKI_PROXY_TARGET ?? DEFAULT_LOKI_TARGET;

// Log the target on startup
appLogger.info({ LOKI_TARGET }, "Loki proxy target configured");

/**
 * Creates proxy configuration options for Loki log forwarding.
 * Exported for testing purposes.
 */
export const createLokiProxyOptions = (): Options => ({
  target: LOKI_TARGET,
  changeOrigin: true,
  timeout: 10000, // 10 second timeout
  proxyTimeout: 10000, // socket timeout
  pathRewrite: (path) => {
    if (path === "/api/v1/push") {
      return "/loki/api/v1/push";
    }
    if (path.startsWith("/api/loki")) {
      return path.replace("/api/loki", "/loki");
    }
    if (!path.startsWith("/loki")) {
      return `/loki${path}`;
    }
    return path;
  },
  on: {
    proxyReq: (proxyReq, req, _res) => {
      appLogger.debug(
        { target: LOKI_TARGET, path: (req as Request).path || (req as Request).url },
        "Loki proxy request starting",
      );

      // Handle socket errors
      proxyReq.on("error", (err) => {
        appLogger.error({ err, target: LOKI_TARGET }, "Loki proxy request error");
      });
    },
    proxyRes: (proxyRes, _req, _res) => {
      appLogger.debug({ statusCode: proxyRes.statusCode }, "Loki proxy response received");
    },
    error: (err, _req, res) => {
      appLogger.error(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { err: { message: err.message, code: (err as any).code }, target: LOKI_TARGET },
        "Loki proxy error",
      );
      if (res && "writeHead" in res && typeof res.writeHead === "function" && !res.headersSent) {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Log forwarding failed" }));
      }
    },
  },
});

/**
 * Proxies client-side log requests to the internal Loki instance.
 * Path restriction to /loki/api/v1/push is enforced by Express routing.
 */
export const lokiProxy = createProxyMiddleware(createLokiProxyOptions());
