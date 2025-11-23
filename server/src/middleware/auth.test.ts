import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { requiresAdmin, requiresAuth } from "./auth.ts";

const createRes = () => {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnThis();
  res.json = vi.fn().mockReturnThis();
  return res as Response;
};

const createNext = () => vi.fn() as NextFunction;

const createReq = (session: Partial<Request["session"]> = {}) => {
  return { session } as Request;
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
