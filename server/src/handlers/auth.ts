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

    req.session.save((err) => {
      if (err) {
        appLogger.error({ err, userId: session.userId }, "[discordCallback] Session save error");
        return res.status(500).json({ error: "Failed to save session" });
      }
      appLogger.debug(
        { userId: session.userId, sessionId: req.sessionID, cookie: req.session.cookie },
        "[discordCallback] Session saved successfully, redirecting to client",
      );
      return res.redirect(env.CLIENT_URL);
    });
  } catch (err: unknown) {
    const axErr = err as AxiosError<unknown>;
    const status = axErr.response?.status ?? 500;
    const data = axErr.response?.data ?? { error: "OAuth exchange failed" };
    appLogger.error({ err, status }, "[discordCallback] OAuth exchange failed");
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
  if (!accessToken) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const user = await authController.getCurrentUser({ accessToken });
    return res.json(user);
  } catch (err: unknown) {
    const axErr = err as AxiosError<unknown>;
    const status = axErr.response?.status ?? 500;
    const data = axErr.response?.data ?? { error: "Failed to fetch user" };
    return res.status(status).json(data);
  }
};
