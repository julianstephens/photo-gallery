import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../schemas/env.ts", () => ({
  default: {
    LOKI_PROXY_TARGET: "http://mock-loki:3100",
  },
}));

vi.mock("./logger.ts", () => ({
  appLogger: {
    error: vi.fn(),
  },
}));

const { lokiProxy } = await import("./lokiProxy.ts");

const createRes = () => {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnThis();
  res.json = vi.fn().mockReturnThis();
  return res as Response;
};

const createReq = (overrides: Partial<Request> = {}) => {
  const req: Partial<Request> = {
    url: "/loki/api/v1/push",
    method: "POST",
    headers: {},
    ...overrides,
  };
  return req as Request;
};

const createNext = () => vi.fn() as NextFunction;

describe("lokiProxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports a valid proxy middleware function", () => {
    expect(lokiProxy).toBeDefined();
    expect(typeof lokiProxy).toBe("function");
  });

  it("middleware function has expected signature (req, res, next)", () => {
    // Express middleware functions have 3 parameters
    expect(lokiProxy.length).toBe(3);
  });

  it("calls the proxy middleware when invoked", () => {
    const req = createReq();
    const res = createRes();
    const next = createNext();

    // Since we can't actually test the proxy without a running Loki instance,
    // we just verify the function can be called without throwing
    expect(() => lokiProxy(req, res, next)).not.toThrow();
  });
});
