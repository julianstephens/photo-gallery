import rateLimit from "express-rate-limit";

// Generic API limiter (15 min window, 100 reqs per IP). Adjust per route group if needed.
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: "draft-7", // RateLimit-* headers
  legacyHeaders: false,
  validate: true,
  message: { error: "Too many requests, please try again later." },
  skip: (req) => req.ip === "::1",
});

// Stricter limiter for auth endpoints
export const authRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many auth attempts. Please wait." },
});
