import { DEFAULT_GUILD_SETTINGS, guildSettingsSchema, type GuildSettings } from "utils";
import redis from "../redis.ts";
import { validateString } from "../utils.ts";

/**
 * Controller for managing guild settings in Redis.
 */
export class GuildSettingsController {
  private readonly keyPrefix = "guilds";

  constructor() {}

  /**
   * Generates the Redis key for guild settings.
   */
  private getSettingsKey(guildId: string): string {
    return `${this.keyPrefix}:${guildId}:settings`;
  }

  /**
   * Retrieves the settings for a guild.
   * Returns default settings if no settings exist.
   */
  getSettings = async (guildId: string): Promise<GuildSettings> => {
    const validatedGuildId = validateString(guildId, "guildId cannot be empty");

    const key = this.getSettingsKey(validatedGuildId);
    const settingsJson = await redis.client.get(key);

    if (!settingsJson) {
      return { ...DEFAULT_GUILD_SETTINGS };
    }

    try {
      const parsed = JSON.parse(settingsJson);
      // Validate and merge with defaults to ensure all fields exist
      const validated = guildSettingsSchema.safeParse(parsed);
      if (validated.success) {
        return validated.data;
      }
      // If validation fails, return defaults
      return { ...DEFAULT_GUILD_SETTINGS };
    } catch {
      // If parsing fails, return defaults
      return { ...DEFAULT_GUILD_SETTINGS };
    }
  };

  /**
   * Updates the settings for a guild.
   */
  updateSettings = async (guildId: string, settings: GuildSettings): Promise<GuildSettings> => {
    const validatedGuildId = validateString(guildId, "guildId cannot be empty");

    // Validate settings before storing
    const validated = guildSettingsSchema.parse(settings);

    const key = this.getSettingsKey(validatedGuildId);
    await redis.client.set(key, JSON.stringify(validated));

    return validated;
  };

  /**
   * Deletes the settings for a guild.
   * Useful for cleanup when a guild is removed.
   */
  deleteSettings = async (guildId: string): Promise<void> => {
    const validatedGuildId = validateString(guildId, "guildId cannot be empty");

    const key = this.getSettingsKey(validatedGuildId);
    await redis.client.del(key);
  };
}
