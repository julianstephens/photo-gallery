import axios, { type AxiosError } from "axios";
import type { Request, Response } from "express";
import env from "../schemas/env.ts";

export const discordCallback = async (req: Request, res: Response) => {
  const code = req.query.code as string;

  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    client_secret: env.DISCORD_CLIENT_SECRET,
    code: code,
    grant_type: "authorization_code",
    redirect_uri: env.DISCORD_REDIRECT_URI,
  });

  try {
    const tokenRes = await axios.post("https://discordapp.com/api/oauth2/token", params, {});
    const token = tokenRes.data.access_token;

    const userRes = await axios.get(`https://discord.com/api/v6/users/@me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return res.send(userRes.data);
  } catch (err: unknown) {
    const axErr = err as AxiosError<unknown>;
    const status = axErr.response?.status ?? 500;
    const data = axErr.response?.data ?? { error: "OAuth exchange failed" };
    return res.status(status).send(data);
  }
};
