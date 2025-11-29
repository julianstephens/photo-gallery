import { createProxyMiddleware } from "http-proxy-middleware";

/**
 * Internal Loki endpoint for log ingestion
 */
const LOKI_TARGET = "http://loki-csss4s88ks00s80k8w4o440c:3100";

/**
 * Proxy middleware that forwards client-side logs to the internal Loki instance.
 * Only proxies requests to /loki/api/v1/push to ensure no other Loki endpoints are exposed.
 */
export const lokiProxy = createProxyMiddleware({
  target: LOKI_TARGET,
  changeOrigin: true,
});
