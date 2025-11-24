import rateLimit, { type RateLimitRequestHandler } from "express-rate-limit";

// Generic API limiter (15 min window, 100 reqs per IP). Adjust per route group if needed.
export const apiRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: "draft-7", // RateLimit-* headers
  legacyHeaders: false,
  trustProxy: 2,
  validate: { trustProxy: false },
  message: { error: "Too many requests, please try again later." },
  skip: (req) => {
    if (req.ip === "::1") {
      return true;
    }
    const originalUrl = req.originalUrl || "";
    if (req.method === "GET" && originalUrl.includes("/galleries/upload/")) {
      return true;
    }
    return false;
  },
  handler: (req, res, _next, options) => {
    const reset = (req as typeof req & { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime;
    if (reset instanceof Date) {
      const deltaSec = Math.max(1, Math.ceil((reset.getTime() - Date.now()) / 1000));
      res.setHeader("Retry-After", String(deltaSec));
    }
    res.status(options.statusCode).json(options.message);
  },
});

// Stricter limiter for auth endpoints
export const authRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  trustProxy: 2,
  validate: { trustProxy: false },
  message: { error: "Too many auth attempts. Please wait." },
  handler: (req, res, _next, options) => {
    const reset = (req as typeof req & { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime;
    if (reset instanceof Date) {
      const deltaSec = Math.max(1, Math.ceil((reset.getTime() - Date.now()) / 1000));
      res.setHeader("Retry-After", String(deltaSec));
    }
    res.status(options.statusCode).json(options.message);
  },
});
