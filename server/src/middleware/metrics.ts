import type { Express, Request, Response } from "express";
import client from "prom-client";

export function setupMetrics(app: Express) {
  // Collect default metrics
  client.collectDefaultMetrics();

  // Simple HTTP metrics example (optional: use prom-client histograms per route)
  const httpRequests = new client.Counter({
    name: "http_requests_total",
    help: "Total HTTP requests",
    labelNames: ["method", "path", "status"],
  });

  app.use((req, res, next) => {
    res.on("finish", () => {
      httpRequests.labels(req.method, req.route?.path || req.path, String(res.statusCode)).inc();
    });
    next();
  });

  // Expose /metrics
  app.get("/metrics", async (_req: Request, res: Response) => {
    res.set("Content-Type", client.register.contentType);
    res.end(await client.register.metrics());
  });
}
