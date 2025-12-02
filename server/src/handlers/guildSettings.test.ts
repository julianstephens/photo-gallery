import type { Request, Response } from "express";
import type { GuildSettings } from "utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const controllerMocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  deleteSettings: vi.fn(),
}));

vi.mock("../controllers/index.ts", () => ({
  GuildSettingsController: vi.fn().mockImplementation(function MockGuildSettingsController() {
    return controllerMocks;
  }),
}));

const handlers = await import("./guildSettings.ts");
const { getGuildSettings, updateGuildSettings } = handlers;

const createRes = () => {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnThis();
  res.json = vi.fn().mockReturnThis();
  return res as Response;
};

const createReq = (overrides: Partial<Request> = {}) => {
  const req: Partial<Request> = {
    body: {},
    params: {},
    session: {} as Request["session"],
    ...overrides,
  };
  if (!req.session) req.session = {} as Request["session"];
  if (!req.body) req.body = {};
  if (!req.params) req.params = {};
  return req as Request;
};

// Valid Discord webhook URL for testing
const VALID_WEBHOOK_URL =
  "https://discord.com/api/webhooks/123456789012345678/AbCdEfGhIjKlMnOpQrStUvWxYz";

const validSettings: GuildSettings = {
  notifications: {
    galleryExpiration: {
      enabled: true,
      webhookUrl: VALID_WEBHOOK_URL,
      daysBefore: 5,
    },
  },
};

describe("guildSettings handlers", () => {
  beforeEach(() => {
    controllerMocks.getSettings.mockReset();
    controllerMocks.updateSettings.mockReset();
    controllerMocks.deleteSettings.mockReset();
  });

  describe("getGuildSettings", () => {
    it("returns the guild settings", async () => {
      const req = createReq({
        params: { guildId: "guild-1" },
        session: { guildIds: ["guild-1"] } as Request["session"],
      });
      const res = createRes();
      controllerMocks.getSettings.mockResolvedValue(validSettings);

      await getGuildSettings(req, res);

      expect(controllerMocks.getSettings).toHaveBeenCalledWith("guild-1");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(validSettings);
    });

    it("returns 400 when guildId is missing", async () => {
      const req = createReq({
        params: {},
        session: { guildIds: ["guild-1"] } as Request["session"],
      });
      const res = createRes();

      await getGuildSettings(req, res);

      expect(controllerMocks.getSettings).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Missing guildId in request params" });
    });

    it("returns 403 when user is not a member of the guild", async () => {
      const req = createReq({
        params: { guildId: "guild-1" },
        session: { guildIds: ["guild-2"] } as Request["session"],
      });
      const res = createRes();

      await getGuildSettings(req, res);

      expect(controllerMocks.getSettings).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "Forbidden: Not a member of the requested guild",
      });
    });

    it("returns 403 when user has no guildIds", async () => {
      const req = createReq({
        params: { guildId: "guild-1" },
        session: {} as Request["session"],
      });
      const res = createRes();

      await getGuildSettings(req, res);

      expect(controllerMocks.getSettings).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("maps invalid input errors to 400", async () => {
      const req = createReq({
        params: { guildId: "guild-1" },
        session: { guildIds: ["guild-1"] } as Request["session"],
      });
      const res = createRes();
      controllerMocks.getSettings.mockRejectedValue({
        name: "InvalidInputError",
        message: "Invalid guild ID",
      });

      await getGuildSettings(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Invalid guild ID" });
    });

    it("returns 500 for unexpected errors", async () => {
      const req = createReq({
        params: { guildId: "guild-1" },
        session: { guildIds: ["guild-1"] } as Request["session"],
      });
      const res = createRes();
      controllerMocks.getSettings.mockRejectedValue(new Error("boom"));

      await getGuildSettings(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to get guild settings" });
    });
  });

  describe("updateGuildSettings", () => {
    it("updates and returns the guild settings", async () => {
      const req = createReq({
        params: { guildId: "guild-1" },
        body: validSettings,
        session: { guildIds: ["guild-1"] } as Request["session"],
      });
      const res = createRes();
      controllerMocks.updateSettings.mockResolvedValue(validSettings);

      await updateGuildSettings(req, res);

      expect(controllerMocks.updateSettings).toHaveBeenCalledWith("guild-1", validSettings);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(validSettings);
    });

    it("returns 400 when guildId is missing", async () => {
      const req = createReq({
        params: {},
        body: validSettings,
        session: { guildIds: ["guild-1"] } as Request["session"],
      });
      const res = createRes();

      await updateGuildSettings(req, res);

      expect(controllerMocks.updateSettings).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Missing guildId in request params" });
    });

    it("returns 403 when user is not a member of the guild", async () => {
      const req = createReq({
        params: { guildId: "guild-1" },
        body: validSettings,
        session: { guildIds: ["guild-2"] } as Request["session"],
      });
      const res = createRes();

      await updateGuildSettings(req, res);

      expect(controllerMocks.updateSettings).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "Forbidden: Not a member of the requested guild",
      });
    });

    it("returns 400 when settings payload is invalid", async () => {
      const req = createReq({
        params: { guildId: "guild-1" },
        body: {
          notifications: {
            galleryExpiration: {
              enabled: "not-a-boolean",
            },
          },
        },
        session: { guildIds: ["guild-1"] } as Request["session"],
      });
      const res = createRes();

      await updateGuildSettings(req, res);

      expect(controllerMocks.updateSettings).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Invalid settings payload" }),
      );
    });

    it("returns 400 when settings payload is missing required fields", async () => {
      const req = createReq({
        params: { guildId: "guild-1" },
        body: {},
        session: { guildIds: ["guild-1"] } as Request["session"],
      });
      const res = createRes();

      await updateGuildSettings(req, res);

      expect(controllerMocks.updateSettings).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("maps invalid input errors to 400", async () => {
      const req = createReq({
        params: { guildId: "guild-1" },
        body: validSettings,
        session: { guildIds: ["guild-1"] } as Request["session"],
      });
      const res = createRes();
      controllerMocks.updateSettings.mockRejectedValue({
        name: "InvalidInputError",
        message: "Invalid guild ID",
      });

      await updateGuildSettings(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Invalid guild ID" });
    });

    it("returns 500 for unexpected errors", async () => {
      const req = createReq({
        params: { guildId: "guild-1" },
        body: validSettings,
        session: { guildIds: ["guild-1"] } as Request["session"],
      });
      const res = createRes();
      controllerMocks.updateSettings.mockRejectedValue(new Error("boom"));

      await updateGuildSettings(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to update guild settings" });
    });
  });
});
