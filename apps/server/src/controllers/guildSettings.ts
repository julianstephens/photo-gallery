import { DEFAULT_GUILD_SETTINGS, guildSettingsSchema, type GuildSettings } from "utils";
import redis from "../redis.ts";
import { validateString } from "../utils.ts";

// TTL for guild settings: 90 days (refreshed on read/write)
const SETTINGS_TTL_SECONDS = 90 * 24 * 60 * 60;

/**
 * Controller for managing guild settings in Redis.
 */
export class GuildSettingsController {
  private readonly keyPrefix = "guild";

  /**
   * Generates the Redis key for guild settings.
   */
  private getSettingsKey(guildId: string): string {
    return `${this.keyPrefix}:${guildId}:settings`;
  }

  /**
   * Retrieves the settings for a guild.
   * Returns default settings if no settings exist.
   * Refreshes TTL on successful read.
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
        // Refresh TTL on successful read
        await redis.client.expire(key, SETTINGS_TTL_SECONDS);
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
   * Sets TTL to ensure settings expire after period of inactivity.
   */
  updateSettings = async (guildId: string, settings: GuildSettings): Promise<GuildSettings> => {
    const validatedGuildId = validateString(guildId, "guildId cannot be empty");

    // Validate settings before storing
    const validated = guildSettingsSchema.parse(settings);

    const key = this.getSettingsKey(validatedGuildId);
    // Use EX option to atomically set value with TTL
    await redis.client.set(key, JSON.stringify(validated), { EX: SETTINGS_TTL_SECONDS });

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
