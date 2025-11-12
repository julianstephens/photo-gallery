import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
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
