import { type AxiosError } from "axios";
import type { Request, Response } from "express";
import env from "../schemas/env.ts";

const authController = await import("../controllers/index.ts").then((m) => new m.AuthController());

export const discordCallback = async (req: Request, res: Response) => {
  const code = req.query.code as string;

  try {
    const session = await authController.login(code);

    req.session.userId = session.userId;
    req.session.username = session.username;
    req.session.accessToken = session.accessToken;
    req.session.refreshToken = session.refreshToken;
    req.session.expiresAt = session.expiresAt;
    req.session.isAdmin = session.isAdmin;

    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
        return res.status(500).json({ error: "Failed to save session" });
      }
      return res.redirect(env.CLIENT_URL);
    });
  } catch (err: unknown) {
    const axErr = err as AxiosError<unknown>;
    const status = axErr.response?.status ?? 500;
    const data = axErr.response?.data ?? { error: "OAuth exchange failed" };
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
