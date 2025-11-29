import type { NextFunction, Request, Response } from "express";
import { createProxyMiddleware, type Options } from "http-proxy-middleware";
import env from "../schemas/env.ts";
import { appLogger } from "./logger.ts";

/**
 * Default internal Loki endpoint for log ingestion
 */
const DEFAULT_LOKI_TARGET = "http://loki-csss4s88ks00s80k8w4o440c:3100";

/**
 * Proxy configuration options for Loki log forwarding
 */
const proxyOptions: Options = {
  target: env.LOKI_PROXY_TARGET ?? DEFAULT_LOKI_TARGET,
  changeOrigin: true,
  timeout: 10000, // 10 second timeout
  on: {
    error: (err, _req, res) => {
      appLogger.error({ err }, "Loki proxy error");
      if (res && "writeHead" in res && typeof res.writeHead === "function") {
        (res as Response).status(502).json({ error: "Log forwarding failed" });
      }
    },
  },
};

/**
 * Proxy middleware that forwards client-side logs to the internal Loki instance.
 * Only proxies requests to /loki/api/v1/push to ensure no other Loki endpoints are exposed.
 */
export const lokiProxy = (req: Request, res: Response, next: NextFunction) => {
  const target = env.LOKI_PROXY_TARGET ?? DEFAULT_LOKI_TARGET;
  if (!target) {
    res.status(503).json({ error: "Loki proxy not configured" });
    return;
  }
  return createProxyMiddleware(proxyOptions)(req, res, next);
};
