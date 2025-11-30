import { createProxyMiddleware, type Options } from "http-proxy-middleware";
import env from "../schemas/env.ts";
import { appLogger } from "./logger.ts";

/**
 * Default internal Loki endpoint for log ingestion
 */
const DEFAULT_LOKI_TARGET = "http://loki-csss4s88ks00s80k8w4o440c:3100";

/**
 * Resolved Loki target URL
 */
const LOKI_TARGET = env.LOKI_PROXY_TARGET ?? DEFAULT_LOKI_TARGET;

/**
 * Creates proxy configuration options for Loki log forwarding.
 * Exported for testing purposes.
 */
export const createLokiProxyOptions = (): Options => ({
  target: LOKI_TARGET,
  changeOrigin: true,
  timeout: 10000, // 10 second timeout
  pathRewrite: { "^/loki": "" },
  on: {
    error: (err, _req, res) => {
      appLogger.error({ err }, "Loki proxy error");
      if (res && "writeHead" in res && typeof res.writeHead === "function" && !res.headersSent) {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Log forwarding failed" }));
      }
    },
  },
});

/**
 * Proxy middleware that forwards client-side logs to the internal Loki instance.
 * Only proxies requests to /loki/api/v1/push to ensure no other Loki endpoints are exposed.
 */
export const lokiProxy = createProxyMiddleware(createLokiProxyOptions());
