export interface DiscordUser {
  id: string;
  username: string;
  global_name: string | null;
  discriminator: string;
  avatar: string;
  verified: boolean;
  email?: string;
  flags: number;
  banner: string;
  accent_color: number;
  premium_type: number;
  public_flags: number;
  avatar_decoration_data: AvatarDecorationData;
  collectibles: Collectibles;
  primary_guild: PrimaryGuild;
}

export interface User extends DiscordUser {
  isAdmin: boolean;
  guilds: PartialGuild[];
}

export interface AvatarDecorationData {
  sku_id: string;
  asset: string;
}

export interface Collectibles {
  nameplate: Nameplate;
}

export interface Nameplate {
  sku_id: string;
  asset: string;
  label: string;
  palette: string;
}

export interface PrimaryGuild {
  identity_guild_id: string;
  identity_enabled: boolean;
  tag: string;
  badge: string;
}

export interface PartialGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
  features: string[];
  approximate_member_count?: number;
  approximate_presence_count?: number;
}
