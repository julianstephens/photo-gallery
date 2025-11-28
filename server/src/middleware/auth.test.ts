import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { requiresAdmin, requiresAuth, requiresGuildMembership } from "./auth.ts";

vi.mock("./logger.ts", () => ({
  appLogger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const createRes = () => {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnThis();
  res.json = vi.fn().mockReturnThis();
  return res as Response;
};

const createNext = () => vi.fn() as NextFunction;

const createReq = (session: Partial<Request["session"]> = {}, overrides: Partial<Request> = {}) => {
  return {
    session,
    query: {},
    path: "/test/path",
    ...overrides,
  } as Request;
};

describe("requiresAuth", () => {
  it("short-circuits when no session user is present", () => {
    const req = createReq();
    const res = createRes();
    const next = createNext();

    requiresAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    expect(next).not.toHaveBeenCalled();
  });

  it("passes control when a userId exists", () => {
    const req = createReq({ userId: "123" });
    const res = createRes();
    const next = createNext();

    requiresAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe("requiresAdmin", () => {
  it("blocks non-admins", () => {
    const req = createReq({ userId: "123", isAdmin: false });
    const res = createRes();
    const next = createNext();

    requiresAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Forbidden: Admins only" });
    expect(next).not.toHaveBeenCalled();
  });

  it("allows admin sessions", () => {
    const req = createReq({ userId: "123", isAdmin: true });
    const res = createRes();
    const next = createNext();

    requiresAdmin(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe("requiresGuildMembership", () => {
  it("returns 400 when guildId query parameter is missing", () => {
    const req = createReq({ userId: "123", guildIds: ["guild-1", "guild-2"] }, { query: {} });
    const res = createRes();
    const next = createNext();

    requiresGuildMembership(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Missing guildId parameter" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 400 when guildId is missing even if guild memberships are also missing", () => {
    const req = createReq({ userId: "123" }, { query: {} });
    const res = createRes();
    const next = createNext();

    requiresGuildMembership(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Missing guildId parameter" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when guild memberships are missing from session", () => {
    const req = createReq({ userId: "123" }, { query: { guildId: "guild-1" } });
    const res = createRes();
    const next = createNext();

    requiresGuildMembership(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Forbidden: Missing guild membership context" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when guild memberships array is empty", () => {
    const req = createReq({ userId: "123", guildIds: [] }, { query: { guildId: "guild-1" } });
    const res = createRes();
    const next = createNext();

    requiresGuildMembership(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Forbidden: Missing guild membership context" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when user is not a member of the requested guild", () => {
    const req = createReq(
      { userId: "123", guildIds: ["guild-1", "guild-2"] },
      { query: { guildId: "unauthorized-guild" } },
    );
    const res = createRes();
    const next = createNext();

    requiresGuildMembership(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: "Forbidden: Not a member of the requested guild",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("allows access when user is a member of the requested guild", () => {
    const req = createReq(
      { userId: "123", guildIds: ["guild-1", "guild-2"] },
      { query: { guildId: "guild-1" } },
    );
    const res = createRes();
    const next = createNext();

    requiresGuildMembership(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
