import redis from "../redis.ts";
import { validateString } from "../utils.ts";

export class GuildController {
  constructor() {}

  getDefaultGuild = async (userId: string): Promise<string | null> => {
    const validatedUserId = validateString(userId, "userId cannot be empty");

    const key = `user:${validatedUserId}:defaultGuild`;

    const guildId = await redis.client.get(key);

    return guildId;
  };

  setDefaultGuild = async (guildId: string, userId: string): Promise<void> => {
    const validatedGuildId = validateString(guildId, "guildId cannot be empty");
    const validatedUserId = validateString(userId, "userId cannot be empty");

    const key = `user:${validatedUserId}:defaultGuild`;

    await redis.client.set(key, validatedGuildId);
  };
}
