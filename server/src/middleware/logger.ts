import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { basename, dirname } from "node:path";
import type { DestinationStream, LoggerOptions, TransportTargetOptions } from "pino";
import pino from "pino";
import { pinoHttp, type Options as PinoHttpOptions } from "pino-http";
import { createStream } from "rotating-file-stream";
import env from "../schemas/env.ts";

/**
 * PII-safe redaction paths for all loggers.
 * These fields are removed from logs to protect sensitive data.
 */
const redactPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "res.headers.set-cookie",
  "req.body.password",
  "req.body.token",
  "req.body.secret",
  "req.body.apiKey",
  "req.body.accessToken",
  "req.body.refreshToken",
];

/**
 * Base logger options shared across all logger instances.
 */
const baseLoggerOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  redact: {
    paths: redactPaths,
    remove: true,
  },
  base: {
    service: "photo-gallery",
    environment: env.NODE_ENV,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

/**
 * Determines the effective log output mode based on environment.
 * - Production: defaults to stdout (JSON logs for Loki/Grafana ingestion)
 * - Development/Test: defaults to file (with rotation for disk space management)
 */
function getLogOutput(): "stdout" | "file" | "both" {
  if (env.LOG_OUTPUT) {
    return env.LOG_OUTPUT;
  }
  return env.NODE_ENV === "production" ? "stdout" : "file";
}

/**
 * Creates a rotating file stream for development/debug logging.
 * Uses rotating-file-stream for automatic log rotation by size and time.
 * Ensures logs don't consume excessive disk space.
 */
function createRotatingFileStream(): DestinationStream {
  const logDir = dirname(env.LOG_FILE_PATH);
  const logFileName = basename(env.LOG_FILE_PATH);

  // Ensure log directory exists
  try {
    mkdirSync(logDir, { recursive: true });
  } catch (error) {
    // Only ignore EEXIST errors - log others to stderr
    if (error instanceof Error && "code" in error && error.code !== "EEXIST") {
      console.error(`Failed to create log directory ${logDir}:`, error.message);
    }
  }

  const stream = createStream(logFileName, {
    path: logDir,
    size: env.LOG_FILE_MAX_SIZE, // e.g., "10M"
    interval: "1d", // rotate daily
    maxFiles: env.LOG_FILE_MAX_FILES, // keep N days of logs
    compress: "gzip", // compress rotated logs
  });

  // The stream from rotating-file-stream is a Writable that implements
  // write() and end() methods compatible with pino's DestinationStream
  return stream as DestinationStream;
}

/**
 * Creates stdout transport configuration for pino.
 * - Production: always outputs JSON for Loki ingestion (even in debug mode)
 * - Development: uses pino-pretty for readable output
 */
function createStdoutTransport(): TransportTargetOptions {
  if (env.NODE_ENV === "production") {
    // Production: ALWAYS JSON logs to stdout for Loki/Grafana ingestion via Fluent Bit
    // Never use pretty-printing in production - it breaks log parsers and sends multiple lines per log
    return {
      target: "pino/file",
      options: {
        destination: 1, // stdout
      },
    };
  }

  // Development: pretty-printed console output
  return {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard",
      ignore: "pid,hostname",
      singleLine: true, // Ensure single line for development too
    },
  };
}

/**
 * Creates a multi-stream logger that writes to both stdout and rotating file.
 * Used when LOG_OUTPUT=both for debugging scenarios.
 */
function createMultiStreamLogger(): pino.Logger {
  const stdoutTransportConfig = createStdoutTransport();
  const stdoutTransport = pino.transport({
    target: stdoutTransportConfig.target,
    options: stdoutTransportConfig.options,
  });
  const fileStream = createRotatingFileStream();

  const multiStream = pino.multistream([{ stream: stdoutTransport }, { stream: fileStream }]);
  return pino(baseLoggerOptions, multiStream);
}

/**
 * Creates the app logger based on environment configuration.
 *
 * Logging strategy:
 * - Production (LOG_OUTPUT=stdout): JSON logs to stdout for Loki/Grafana ingestion
 * - Development (LOG_OUTPUT=file): Rotating file logs with pretty console fallback
 * - Debug (LOG_OUTPUT=both): Both stdout and rotating file
 */
function createAppLogger(): pino.Logger {
  const logOutput = getLogOutput();

  if (logOutput === "stdout") {
    // Production: JSON logs to stdout for container logging
    const transportConfig = createStdoutTransport();
    const transport = pino.transport({
      target: transportConfig.target,
      options: transportConfig.options,
    });
    return pino(baseLoggerOptions, transport);
  }

  if (logOutput === "file") {
    // Development: rotating file logs
    const fileStream = createRotatingFileStream();
    return pino(baseLoggerOptions, fileStream);
  }

  // Both: multi-stream to stdout and rotating file
  return createMultiStreamLogger();
}

/**
 * Creates the HTTP logger based on environment configuration.
 * Uses the same output strategy as appLogger for consistency.
 */
function createHttpLogger(): pino.Logger {
  const logOutput = getLogOutput();

  if (logOutput === "stdout") {
    // Production: JSON logs to stdout for container logging
    const transportConfig = createStdoutTransport();
    const transport = pino.transport({
      target: transportConfig.target,
      options: transportConfig.options,
    });
    return pino(baseLoggerOptions, transport);
  }

  if (logOutput === "file") {
    // Development: rotating file logs
    const fileStream = createRotatingFileStream();
    return pino(baseLoggerOptions, fileStream);
  }

  // Both: multi-stream to stdout and rotating file
  return createMultiStreamLogger();
}

/**
 * HTTP logger for request/response logging.
 * Uses the same output configuration as appLogger for consistency.
 */
export const logger = createHttpLogger();

/**
 * Application logger for business logic, services, and workers.
 * Routes to stdout (production) or rotating file (development).
 */
export const appLogger = createAppLogger();

/**
 * HTTP middleware logger for Express.
 * Logs incoming requests with request ID tracking.
 */
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

/**
 * Creates a child logger with additional context.
 * Use for adding request/job metadata to log entries.
 *
 * @example
 * const reqLogger = createChildLogger({ requestId: req.id, userId: user.id });
 * reqLogger.info('Processing request');
 */
export function createChildLogger(bindings: Record<string, unknown>): pino.Logger {
  return appLogger.child(bindings);
}
