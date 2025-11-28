import type { NextFunction, Request, Response } from "express";
import { appLogger } from "./logger.ts";

export const requiresAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
};

export const requiresAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.session.isAdmin) {
    return res.status(403).json({ error: "Forbidden: Admins only" });
  }
  next();
};

/**
 * Middleware to validate guild membership for the given guildId.
 * Checks that the user's session contains guild memberships and that the
 * requested guildId is in their list of authenticated guilds.
 */
export const requiresGuildMembership = (req: Request, res: Response, next: NextFunction) => {
  const guildId = req.query.guildId as string;

  // Check for authenticated guild memberships in session
  const guildIds = req.session.guildIds;
  if (!guildIds || guildIds.length === 0) {
    appLogger.warn(
      { userId: req.session.userId, path: req.path },
      "[requiresGuildMembership] Missing guild membership context",
    );
    return res.status(403).json({ error: "Forbidden: Missing guild membership context" });
  }

  // Validate guildId is present in query
  if (!guildId) {
    appLogger.warn(
      { userId: req.session.userId, path: req.path },
      "[requiresGuildMembership] Missing guildId parameter",
    );
    return res.status(400).json({ error: "Missing guildId parameter" });
  }

  // Cross-check guildId against verified memberships
  if (!guildIds.includes(guildId)) {
    appLogger.warn(
      { userId: req.session.userId, requestedGuildId: guildId, path: req.path },
      "[requiresGuildMembership] User not a member of requested guild",
    );
    return res.status(403).json({ error: "Forbidden: Not a member of the requested guild" });
  }

  next();
};
