import type { Request, Response } from "express";
import { guildSettingsSchema } from "utils";
import { appLogger } from "../middleware/logger.ts";

const guildSettingsController = await import("../controllers/index.ts").then(
  (m) => new m.GuildSettingsController(),
);

export const getGuildSettings = async (req: Request, res: Response) => {
  const { guildId } = req.params;

  if (!guildId) {
    return res.status(400).json({ error: "Missing guildId in request params" });
  }

  // Verify the user is a member of the guild
  const guildIds = req.session.guildIds;
  if (!guildIds || !guildIds.includes(guildId)) {
    return res.status(403).json({ error: "Forbidden: Not a member of the requested guild" });
  }

  try {
    const settings = await guildSettingsController.getSettings(guildId);
    res.status(200).json(settings);
  } catch (err: unknown) {
    if ((err as Error)?.name === "InvalidInputError") {
      return res.status(400).json({ error: (err as Error).message });
    }
    appLogger.error({ err, guildId }, "[getGuildSettings] error");
    res.status(500).json({ error: "Failed to get guild settings" });
  }
};

export const updateGuildSettings = async (req: Request, res: Response) => {
  const { guildId } = req.params;

  if (!guildId) {
    return res.status(400).json({ error: "Missing guildId in request params" });
  }

  // Verify the user is a member of the guild
  const guildIds = req.session.guildIds;
  if (!guildIds || !guildIds.includes(guildId)) {
    return res.status(403).json({ error: "Forbidden: Not a member of the requested guild" });
  }

  // Validate the settings payload
  const parseResult = guildSettingsSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: "Invalid settings payload",
      details: parseResult.error.issues,
    });
  }

  try {
    const updatedSettings = await guildSettingsController.updateSettings(guildId, parseResult.data);
    res.status(200).json(updatedSettings);
  } catch (err: unknown) {
    if ((err as Error)?.name === "InvalidInputError") {
      return res.status(400).json({ error: (err as Error).message });
    }
    appLogger.error({ err, guildId }, "[updateGuildSettings] error");
    res.status(500).json({ error: "Failed to update guild settings" });
  }
};
