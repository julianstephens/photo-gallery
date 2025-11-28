import type { Request, Response } from "express";

const guildController = await import("../controllers/index.ts").then(
  (m) => new m.GuildController(),
);

export const getDefaultGuild = async (req: Request, res: Response) => {
  try {
    const guildId = await guildController.getDefaultGuild(req.session.userId || "");
    res.status(200).json({ guildId });
  } catch (err: unknown) {
    if ((err as Error)?.name === "InvalidInputError") {
      return res.status(400).json({ error: (err as Error).message });
    }
    res.status(500).json({ error: "Failed to get default guild" });
  }
};

export const setDefaultGuild = async (req: Request, res: Response) => {
  const { guildId } = req.body;
  if (!guildId) {
    return res.status(400).json({ error: "Missing guildId in request body" });
  }

  const guildIds = req.session.guildIds;
  if (!guildIds || !guildIds.includes(guildId)) {
    return res.status(403).json({ error: "Forbidden: Not a member of the requested guild" });
  }

  try {
    await guildController.setDefaultGuild(guildId, req.session.userId || "");
    res.status(200).json({ message: "Default guild set successfully" });
  } catch (err: unknown) {
    if ((err as Error)?.name === "InvalidInputError") {
      return res.status(400).json({ error: (err as Error).message });
    }
    res.status(500).json({ error: "Failed to set default guild" });
  }
};
