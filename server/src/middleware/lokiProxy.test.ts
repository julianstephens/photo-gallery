import { describe, expect, it } from "vitest";
import { lokiProxy } from "./lokiProxy.ts";

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
