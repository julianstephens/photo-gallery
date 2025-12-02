import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const controllerMocks = vi.hoisted(() => ({
  getDefaultGuild: vi.fn(),
  setDefaultGuild: vi.fn(),
}));

vi.mock("../controllers/index.ts", () => ({
  GuildController: vi.fn().mockImplementation(function MockGuildController() {
    return controllerMocks;
  }),
}));

vi.mock("../middleware/responseCache.ts", () => ({
  invalidateDefaultGuildCache: vi.fn().mockResolvedValue(undefined),
  invalidateGalleriesCache: vi.fn().mockResolvedValue(undefined),
  defaultGuildCache: vi.fn(),
  galleriesCache: vi.fn(),
  createResponseCache: vi.fn(),
}));

const handlers = await import("./guild.ts");
const { getDefaultGuild, setDefaultGuild } = handlers;

const createRes = () => {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnThis();
  res.json = vi.fn().mockReturnThis();
  return res as Response;
};

const createReq = (overrides: Partial<Request> = {}) => {
  const req: Partial<Request> = {
    body: {},
    session: {} as Request["session"],
    ...overrides,
  };
  if (!req.session) req.session = {} as Request["session"];
  if (!req.body) req.body = {};
  return req as Request;
};

describe("guild handlers", () => {
  beforeEach(() => {
    controllerMocks.getDefaultGuild.mockReset();
    controllerMocks.setDefaultGuild.mockReset();
  });

  describe("getDefaultGuild", () => {
    it("returns the default guild id", async () => {
      const req = createReq({ session: { userId: "user-1" } as Request["session"] });
      const res = createRes();
      controllerMocks.getDefaultGuild.mockResolvedValue("guild-1");

      await getDefaultGuild(req, res);

      expect(controllerMocks.getDefaultGuild).toHaveBeenCalledWith("user-1");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ guildId: "guild-1" });
    });

    it("maps invalid input to 400", async () => {
      const req = createReq({ session: { userId: "user-1" } as Request["session"] });
      const res = createRes();
      controllerMocks.getDefaultGuild.mockRejectedValue({
        name: "InvalidInputError",
        message: "No default",
      });

      await getDefaultGuild(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "No default" });
    });

    it("returns 500 for unexpected errors", async () => {
      const req = createReq({ session: { userId: "user-1" } as Request["session"] });
      const res = createRes();
      controllerMocks.getDefaultGuild.mockRejectedValue(new Error("boom"));

      await getDefaultGuild(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to get default guild" });
    });
  });

  describe("setDefaultGuild", () => {
    it("requires guildId", async () => {
      const req = createReq();
      const res = createRes();

      await setDefaultGuild(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Missing guildId in request body" });
      expect(controllerMocks.setDefaultGuild).not.toHaveBeenCalled();
    });

    it("sets the default guild", async () => {
      const req = createReq({
        body: { guildId: "guild-2" },
        session: { userId: "user-2", guildIds: ["guild-2"] } as Request["session"],
      });
      const res = createRes();

      await setDefaultGuild(req, res);

      expect(controllerMocks.setDefaultGuild).toHaveBeenCalledWith("guild-2", "user-2");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: "Default guild set successfully" });
    });

    it("returns 403 when user is not a member of requested guild", async () => {
      const req = createReq({
        body: { guildId: "guild-2" },
        session: { userId: "user-2", guildIds: ["guild-1"] } as Request["session"],
      });
      const res = createRes();

      await setDefaultGuild(req, res);

      expect(controllerMocks.setDefaultGuild).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "Forbidden: Not a member of the requested guild",
      });
    });

    it("maps invalid input errors", async () => {
      const req = createReq({
        body: { guildId: "guild-2" },
        session: { userId: "user-2", guildIds: ["guild-2"] } as Request["session"],
      });
      const res = createRes();
      controllerMocks.setDefaultGuild.mockRejectedValue({
        name: "InvalidInputError",
        message: "bad guild",
      });

      await setDefaultGuild(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "bad guild" });
    });

    it("returns 500 for unexpected failures", async () => {
      const req = createReq({
        body: { guildId: "guild-2" },
        session: { userId: "user-2", guildIds: ["guild-2"] } as Request["session"],
      });
      const res = createRes();
      controllerMocks.setDefaultGuild.mockRejectedValue(new Error("boom"));

      await setDefaultGuild(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to set default guild" });
    });
  });
});
