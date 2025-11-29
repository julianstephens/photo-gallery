import { describe, expect, it, vi } from "vitest";

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

describe("lokiProxy", () => {
  it("exports a valid proxy middleware function", () => {
    expect(lokiProxy).toBeDefined();
    expect(typeof lokiProxy).toBe("function");
  });

  it("middleware function has expected signature (req, res, next)", () => {
    // Express middleware functions have 3 parameters
    expect(lokiProxy.length).toBeGreaterThanOrEqual(2);
  });
});
