export interface DiscordTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export interface AuthSessionData {
  userId: string;
  username: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  isAdmin: boolean;
}

export interface TokenParam {
  accessToken: string;
}
