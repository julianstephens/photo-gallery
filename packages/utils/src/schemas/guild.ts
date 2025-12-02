import { z } from "zod";

/**
 * Schema for guild notification settings stored in Redis.
 * Key pattern: guilds:{guildId}:settings
 */
export const guildNotificationSettingsSchema = z.object({
  enabled: z.boolean(),
  webhookUrl: z.string().url().optional(),
  daysBefore: z.number().int().min(1).max(30).default(7),
});

/**
 * Full guild settings schema including notification configuration.
 */
export const guildSettingsSchema = z.object({
  notifications: guildNotificationSettingsSchema.optional(),
});
