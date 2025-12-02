import { type AxiosError } from "axios";
import type { Request, Response } from "express";
import { appLogger } from "../middleware/logger.ts";
import env from "../schemas/env.ts";

const authController = await import("../controllers/index.ts").then((m) => new m.AuthController());

export const discordCallback = async (req: Request, res: Response) => {
  const code = req.query.code as string;

  try {
    const session = await authController.login(code);

    appLogger.debug(
      { userId: session.userId, guildCount: session.guildIds.length },
      "[discordCallback] OAuth login successful",
    );

    req.session.userId = session.userId;
    req.session.username = session.username;
    req.session.accessToken = session.accessToken;
    req.session.refreshToken = session.refreshToken;
    req.session.expiresAt = session.expiresAt;
    req.session.isAdmin = session.isAdmin;
    req.session.isSuperAdmin = session.isSuperAdmin;
    req.session.guildIds = session.guildIds;

    appLogger.debug(
      { userId: session.userId, sessionId: req.sessionID },
      "[discordCallback] Session data set, saving to store",
    );

    // Explicitly wait for session to be saved to Redis before redirecting
    // This ensures the session is available when the client makes subsequent requests
    req.session.save((err) => {
      if (err) {
        appLogger.error(
          { err, userId: session.userId, sessionId: req.sessionID },
          "[discordCallback] Session save error - session may not be persisted",
        );
        return res.status(500).json({ error: "Failed to save session" });
      }
      appLogger.debug(
        {
          userId: session.userId,
          sessionId: req.sessionID,
          sessionExists: !!req.session,
          hasAccessToken: !!req.session.accessToken,
        },
        "[discordCallback] Session saved to Redis successfully, redirecting to client",
      );
      return res.redirect(env.CLIENT_URL);
    });
  } catch (err: unknown) {
    const axErr = err as AxiosError<unknown>;
    const status = axErr.response?.status ?? 500;
    const data = axErr.response?.data ?? { error: "OAuth exchange failed" };
    appLogger.error({ err, status, code }, "[discordCallback] OAuth exchange failed");
    return res.status(status).json(data);
  }
};

export const logout = async (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: "Failed to logout" });
    }
    res.clearCookie("connect.sid");
    return res.json({ message: "Logged out successfully" });
  });
};

export const getCurrentUser = async (req: Request, res: Response) => {
  const accessToken = req.session.accessToken;
  const sessionId = req.sessionID;

  if (!accessToken) {
    appLogger.warn(
      { sessionId, hasSession: !!req.session, sessionKeys: Object.keys(req.session || {}) },
      "[getCurrentUser] No access token in session",
    );
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const user = await authController.getCurrentUser({ accessToken });
    appLogger.debug({ userId: user.id, sessionId }, "[getCurrentUser] User retrieved successfully");
    return res.json(user);
  } catch (err: unknown) {
    const axErr = err as AxiosError<unknown>;
    const status = axErr.response?.status ?? 500;
    const data = axErr.response?.data ?? { error: "Failed to fetch user" };
    appLogger.error(
      { err, status, sessionId, sessionHasToken: !!req.session.accessToken },
      "[getCurrentUser] Failed to fetch user from Discord",
    );
    return res.status(status).json(data);
  }
};
