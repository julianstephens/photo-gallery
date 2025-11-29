import type { Response } from "express";
import { describe, expect, it, vi } from "vitest";
import {
  apiRateLimiter,
  authRateLimiter,
  createRateLimitHandler,
  skipLocalhost,
  uploadRateLimiter,
} from "./rateLimit.ts";

describe("skipLocalhost", () => {
  it("returns true for localhost IPv6 address", () => {
    expect(skipLocalhost({ ip: "::1" })).toBe(true);
  });

  it("returns false for non-localhost IP", () => {
    expect(skipLocalhost({ ip: "192.168.1.1" })).toBe(false);
  });

  it("returns false for undefined IP", () => {
    expect(skipLocalhost({ ip: undefined })).toBe(false);
  });

  it("returns false for empty string IP", () => {
    expect(skipLocalhost({ ip: "" })).toBe(false);
  });
});

describe("createRateLimitHandler", () => {
  const createMockRes = () => {
    const res: Partial<Response> = {};
    res.setHeader = vi.fn().mockReturnThis();
    res.status = vi.fn().mockReturnThis();
    res.json = vi.fn().mockReturnThis();
    return res as Response;
  };

  it("sets Retry-After header when resetTime is available", () => {
    const handler = createRateLimitHandler();
    const resetTime = new Date(Date.now() + 60000); // 60 seconds in the future
    const req = {
      rateLimit: { resetTime },
    } as Parameters<ReturnType<typeof createRateLimitHandler>>[0] & {
      rateLimit?: { resetTime?: Date };
    };
    const res = createMockRes();
    const next = vi.fn();
    const options = { statusCode: 429, message: { error: "Too many requests" } };

    handler(req, res, next, options);

    expect(res.setHeader).toHaveBeenCalledWith("Retry-After", expect.any(String));
    const retryAfterValue = (res.setHeader as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(Number(retryAfterValue)).toBeGreaterThanOrEqual(1);
    expect(Number(retryAfterValue)).toBeLessThanOrEqual(60);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({ error: "Too many requests" });
  });

  it("does not set Retry-After header when resetTime is not available", () => {
    const handler = createRateLimitHandler();
    const req = {} as Parameters<ReturnType<typeof createRateLimitHandler>>[0];
    const res = createMockRes();
    const next = vi.fn();
    const options = { statusCode: 429, message: { error: "Too many requests" } };

    handler(req, res, next, options);

    expect(res.setHeader).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({ error: "Too many requests" });
  });

  it("sets minimum Retry-After of 1 second when resetTime is in the past", () => {
    const handler = createRateLimitHandler();
    const resetTime = new Date(Date.now() - 5000); // 5 seconds in the past
    const req = {
      rateLimit: { resetTime },
    } as Parameters<ReturnType<typeof createRateLimitHandler>>[0] & {
      rateLimit?: { resetTime?: Date };
    };
    const res = createMockRes();
    const next = vi.fn();
    const options = { statusCode: 429, message: { error: "Rate limited" } };

    handler(req, res, next, options);

    expect(res.setHeader).toHaveBeenCalledWith("Retry-After", "1");
    expect(res.status).toHaveBeenCalledWith(429);
  });

  it("handles rateLimit object without resetTime", () => {
    const handler = createRateLimitHandler();
    const req = {
      rateLimit: {},
    } as Parameters<ReturnType<typeof createRateLimitHandler>>[0] & {
      rateLimit?: { resetTime?: Date };
    };
    const res = createMockRes();
    const next = vi.fn();
    const options = { statusCode: 429, message: { error: "Too many requests" } };

    handler(req, res, next, options);

    expect(res.setHeader).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
  });
});

describe("rate limiters configuration", () => {
  it("exports apiRateLimiter", () => {
    expect(apiRateLimiter).toBeDefined();
    expect(typeof apiRateLimiter).toBe("function");
  });

  it("exports uploadRateLimiter", () => {
    expect(uploadRateLimiter).toBeDefined();
    expect(typeof uploadRateLimiter).toBe("function");
  });

  it("exports authRateLimiter", () => {
    expect(authRateLimiter).toBeDefined();
    expect(typeof authRateLimiter).toBe("function");
  });
});
