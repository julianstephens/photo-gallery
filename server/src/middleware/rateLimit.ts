import rateLimit, { type RateLimitRequestHandler } from "express-rate-limit";

// Helper: creates a common rate limit handler that sets Retry-After header
export const createRateLimitHandler =
  () =>
  (
    req: Parameters<RateLimitRequestHandler>[0],
    res: Parameters<RateLimitRequestHandler>[1],
    _next: Parameters<RateLimitRequestHandler>[2],
    options: { statusCode: number; message: unknown },
  ) => {
    const reset = (req as typeof req & { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime;
    if (reset instanceof Date) {
      const deltaSec = Math.max(1, Math.ceil((reset.getTime() - Date.now()) / 1000));
      res.setHeader("Retry-After", String(deltaSec));
    }
    res.status(options.statusCode).json(options.message);
  };

// Helper: skip localhost requests
export const skipLocalhost = (req: { ip?: string }) => req.ip === "::1";

// Generic API limiter (15 min window, 100 reqs per IP). Adjust per route group if needed.
export const apiRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: "draft-7", // RateLimit-* headers
  legacyHeaders: false,
  validate: { trustProxy: true },
  message: { error: "Too many requests, please try again later." },
  skip: (req) => {
    if (skipLocalhost(req)) {
      return true;
    }
    const originalUrl = req.originalUrl || "";
    if (req.method === "GET" && originalUrl.includes("/galleries/upload/")) {
      return true;
    }
    return false;
  },
  handler: createRateLimitHandler(),
});

// Lenient limiter for chunked uploads (5 min window, 500 reqs per IP)
export const uploadRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 500,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  validate: { trustProxy: true },
  message: { error: "Too many upload requests, please try again later." },
  skip: skipLocalhost,
  handler: createRateLimitHandler(),
});

// Stricter limiter for auth endpoints
export const authRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  validate: { trustProxy: true },
  message: { error: "Too many auth attempts. Please wait." },
  handler: createRateLimitHandler(),
});
