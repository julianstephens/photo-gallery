import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockEnv, mockEnvModule } from "../utils/test-mocks.ts";

const controllerMocks = vi.hoisted(() => ({
  login: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock("../controllers/index.ts", () => ({
  AuthController: vi.fn().mockImplementation(function MockAuthController() {
    return controllerMocks;
  }),
}));

vi.mock("../schemas/env.ts", () => mockEnvModule());

const handlers = await import("./auth.ts");
const { discordCallback, logout, getCurrentUser } = handlers;

const createResponse = () => {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnThis();
  res.json = vi.fn().mockReturnThis();
  res.redirect = vi.fn();
  res.clearCookie = vi.fn();
  return res as Response;
};

const createRequest = (overrides: Partial<Request> = {}) => {
  // Extract session from overrides before spreading
  const { session: overrideSession, ...otherOverrides } = overrides;

  const defaultSession = {
    save: vi.fn().mockImplementation((cb: (err?: Error | null) => void) => {
      cb(null);
    }),
  };

  // Merge session: defaults first, then overrides
  const session = { ...defaultSession, ...overrideSession };

  return {
    query: {},
    app: {
      get: vi.fn(),
    },
    headers: {
      "x-forwarded-proto": "https",
      "x-forwarded-for": "127.0.0.1",
      host: "localhost",
    },
    secure: true,
    protocol: "https",
    sessionID: "test-session",
    ...otherOverrides,
    session,
  } as unknown as Request;
};

describe("auth handlers", () => {
  beforeEach(() => {
    controllerMocks.login.mockReset();
    controllerMocks.getCurrentUser.mockReset();
  });

  it("redirects to the client after successful Discord login", async () => {
    const req = createRequest({ query: { code: "abc123" } as Request["query"] });
    const res = createResponse();
    controllerMocks.login.mockResolvedValue({
      userId: "user-1",
      username: "Jane Doe",
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: 123,
      isAdmin: true,
      guildIds: ["guild-1", "guild-2"],
    });

    await discordCallback(req, res);

    expect(controllerMocks.login).toHaveBeenCalledWith("abc123");
    expect(req.session).toMatchObject({
      userId: "user-1",
      username: "Jane Doe",
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: 123,
      isAdmin: true,
      guildIds: ["guild-1", "guild-2"],
    });
    expect(res.redirect).toHaveBeenCalledWith(mockEnv.CLIENT_URL);
  });
  it("returns the upstream error when Discord login fails", async () => {
    const req = createRequest({ query: { code: "bad" } as Request["query"] });
    const res = createResponse();
    controllerMocks.login.mockRejectedValue({
      response: { status: 418, data: { error: "teapot" } },
    });

    await discordCallback(req, res);

    expect(res.status).toHaveBeenCalledWith(418);
    expect(res.json).toHaveBeenCalledWith({ error: "teapot" });
  });

  it("destroys the session and clears the cookie on logout", async () => {
    const req = createRequest({
      session: {
        destroy: (cb: (err?: Error | null) => void) => cb(null),
      } as unknown as Request["session"],
    });
    const res = createResponse();

    await logout(req, res);

    expect(res.clearCookie).toHaveBeenCalledWith("connect.sid");
    expect(res.json).toHaveBeenCalledWith({ message: "Logged out successfully" });
  });

  it("propagates errors when logout fails", async () => {
    const req = createRequest({
      session: {
        destroy: (cb: (err?: Error | null) => void) => cb(new Error("boom")),
      } as unknown as Request["session"],
    });
    const res = createResponse();

    await logout(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Failed to logout" });
    expect(res.clearCookie).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated current user lookups", async () => {
    const req = createRequest();
    const res = createResponse();

    await getCurrentUser(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    expect(controllerMocks.getCurrentUser).not.toHaveBeenCalled();
  });

  it("returns the user payload when a session exists", async () => {
    const req = createRequest({ session: { accessToken: "token" } as Request["session"] });
    const res = createResponse();
    controllerMocks.getCurrentUser.mockResolvedValue({ id: "123" });

    await getCurrentUser(req, res);

    expect(controllerMocks.getCurrentUser).toHaveBeenCalledWith({ accessToken: "token" });
    expect(res.json).toHaveBeenCalledWith({ id: "123" });
  });

  it("maps downstream failures when fetching the current user", async () => {
    const req = createRequest({ session: { accessToken: "token" } as Request["session"] });
    const res = createResponse();
    controllerMocks.getCurrentUser.mockRejectedValue({
      response: { status: 503, data: { error: "Service Unavailable" } },
    });

    await getCurrentUser(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ error: "Service Unavailable" });
  });
});
