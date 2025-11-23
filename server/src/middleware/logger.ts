import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname } from "node:path";
import pino from "pino";
import { pinoHttp, type Options as PinoHttpOptions } from "pino-http";
import env from "../schemas/env.ts";

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers.set-cookie",
      "req.body.password",
      "req.body.token",
    ],
    remove: true,
  },
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Application logger: writes structured logs to file instead of console
const appLogPath = "logs/app.log";
try {
  const logsDir = dirname(appLogPath);
  mkdirSync(logsDir, { recursive: true });
} catch {
  // best-effort: if this fails, pino will still throw when writing
}

export const appLogger = pino(
  {
    level: env.LOG_LEVEL,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "res.headers.set-cookie",
        "req.body.password",
        "req.body.token",
      ],
      remove: true,
    },
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.destination(appLogPath),
);

export const httpLogger = pinoHttp<IncomingMessage, ServerResponse>({
  logger,
  autoLogging: {
    ignore: (req) => req.url?.startsWith("/healthz") || req.url?.startsWith("/metrics") || false,
  },
  customLogLevel: (res, err) => {
    if (err || (res.statusCode && res.statusCode >= 500)) return "error";
    if (res.statusCode && res.statusCode >= 400) return "warn";
    return "info";
  },
  genReqId: (req, res) => {
    const hdr = req.headers["x-request-id"];
    const id = typeof hdr === "string" && hdr.trim() ? hdr : randomUUID();
    res.setHeader("x-request-id", id);
    return id;
  },
  serializers: {
    req(req) {
      return {
        id: req.id,
        method: req.method,
        url: req.url,
        remoteAddress: req.ip || req.socket?.remoteAddress,
        userAgent: req.headers["user-agent"],
      };
    },
  },
} as PinoHttpOptions);
