import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

let lokiProxy: any;
let createLokiProxyOptions: any;

const mockAppLogger = {
  error: vi.fn(),
};

// Use vi.doMock to ensure mocks are applied before import
beforeEach(async () => {
  vi.doMock("../schemas/env.ts", () => ({
    default: {
      LOKI_PROXY_TARGET: "http://mock-loki:3100",
    },
  }));
  vi.doMock("./logger.ts", () => ({
    appLogger: mockAppLogger,
  }));
  // Dynamically import after mocks are set up
  const mod = await import("./lokiProxy.ts");
  lokiProxy = mod.lokiProxy;
  createLokiProxyOptions = mod.createLokiProxyOptions;
});
const createRes = () => {
  const res: Partial<Response> & { headersSent: boolean } = {
    headersSent: false,
  };
  res.writeHead = vi.fn().mockReturnThis();
  res.end = vi.fn().mockReturnThis();
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

const _createNext = () => vi.fn() as NextFunction;

describe("lokiProxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports a valid proxy middleware function", () => {
    expect(lokiProxy).toBeDefined();
    expect(typeof lokiProxy).toBe("function");
  });

  it("middleware function has expected signature (req, res, next)", () => {
    // Express middleware functions have at least 2 parameters
    expect(lokiProxy.length).toBeGreaterThanOrEqual(2);
  });
});

describe("createLokiProxyOptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns options with correct target", () => {
    const options = createLokiProxyOptions();
    expect(options.target).toBe("http://mock-loki:3100");
  });

  it("has changeOrigin set to true", () => {
    const options = createLokiProxyOptions();
    expect(options.changeOrigin).toBe(true);
  });

  it("has timeout set to 10 seconds", () => {
    const options = createLokiProxyOptions();
    expect(options.timeout).toBe(10000);
  });

  it("has pathRewrite to preserve /loki prefix", () => {
    const options = createLokiProxyOptions();
    expect(options.pathRewrite).toEqual({ "^/loki": "/loki" });
  });

  describe("error handler", () => {
    it("logs error and sends 502 response when error occurs", () => {
      const options = createLokiProxyOptions();
      const res = createRes();
      const mockError = new Error("Connection refused");

      options.on?.error?.(mockError, createReq(), res, "http://mock-loki:3100");

      expect(mockAppLogger.error).toHaveBeenCalledWith({ err: mockError }, "Loki proxy error");
      expect(res.writeHead).toHaveBeenCalledWith(502, { "Content-Type": "application/json" });
      expect(res.end).toHaveBeenCalledWith(JSON.stringify({ error: "Log forwarding failed" }));
    });

    it("does not send response if headers already sent", () => {
      const options = createLokiProxyOptions();
      const res = createRes();
      res.headersSent = true;
      const mockError = new Error("Connection refused");

      options.on?.error?.(mockError, createReq(), res, "http://mock-loki:3100");

      expect(mockAppLogger.error).toHaveBeenCalledWith({ err: mockError }, "Loki proxy error");
      expect(res.writeHead).not.toHaveBeenCalled();
      expect(res.end).not.toHaveBeenCalled();
    });

    it("handles null response gracefully", () => {
      const options = createLokiProxyOptions();
      const mockError = new Error("Connection refused");

      // Should not throw when res is null
      expect(() => {
        options.on?.error?.(
          mockError,
          createReq(),
          null as unknown as Response,
          "http://mock-loki:3100",
        );
      }).not.toThrow();

      expect(mockAppLogger.error).toHaveBeenCalledWith({ err: mockError }, "Loki proxy error");
    });
  });
});
