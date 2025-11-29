import axios from "axios";
import type { DiscordUser, PartialGuild, User } from "utils";
import env from "../schemas/env.ts";
import type { AuthSessionData, DiscordTokenResponse, TokenParam } from "../types.ts";

export class AuthController {
  #buildTokenParams(code: string) {
    return new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      redirect_uri: env.DISCORD_REDIRECT_URI,
      code,
    });
  }

  #isAdminUser = (userId: string, opts?: { super: boolean }): boolean => {
    if (opts?.super) {
      return env.SUPER_ADMIN_USER_IDS.includes(userId);
    }
    return env.ADMIN_USER_IDS.includes(userId);
  };

  login = async (code: string): Promise<AuthSessionData> => {
    const params = this.#buildTokenParams(code);
    const { data } = await axios.post<DiscordTokenResponse>(
      `${env.DISCORD_API_URL}/oauth2/token`,
      params.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );

    const user = await this.getCurrentUser({ accessToken: data.access_token });

    const sess: AuthSessionData = {
      userId: user.id,
      username: user.username,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      isSuperAdmin: this.#isAdminUser(user.id, { super: true }),
      isAdmin: false,
      guildIds: user.guilds.map((g) => g.id),
    };
    sess.isAdmin = sess.isSuperAdmin ? true : this.#isAdminUser(user.id);
    return sess;
  };

  logout() {
    // No server-side action needed; session will be destroyed in the handler
  }

  getCurrentUser = async ({ accessToken }: TokenParam) => {
    const { data } = await axios.get<DiscordUser>(`${env.DISCORD_API_URL}/users/@me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const guilds = await this.getUserGuilds({ accessToken });
    return { ...data, isAdmin: this.#isAdminUser(data.id), guilds } as User;
  };

  getUserGuilds = async ({ accessToken }: TokenParam) => {
    const { data } = await axios.get<PartialGuild[]>(`${env.DISCORD_API_URL}/users/@me/guilds`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    return data;
  };
}
