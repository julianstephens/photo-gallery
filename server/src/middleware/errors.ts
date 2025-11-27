import type { ErrorRequestHandler, RequestHandler } from "express";
import env from "../schemas/env.ts";

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: "Not Found" });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = typeof err?.status === "number" ? err.status : 500;
  const code = err?.code || (status >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST");
  const message =
    env.NODE_ENV === "production" && status >= 500
      ? "Internal Server Error"
      : err?.message || "Request failed";

  const requestId = res.getHeader("x-request-id");

  res.status(status).json({
    error: message,
    code,
    requestId,
  });
};
