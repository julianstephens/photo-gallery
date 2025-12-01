import { z } from "zod";

/**
 * Regex pattern for Discord snowflake IDs.
 *
 * Discord snowflake IDs are unique 64-bit identifiers used throughout the Discord API
 * for users, channels, guilds, messages, and other resources. They encode a timestamp
 * (milliseconds since Discord epoch: 2015-01-01), worker ID, process ID, and increment.
 *
 * Snowflake IDs are represented as strings of 17-19 decimal digits (the range of a
 * 64-bit unsigned integer). For example: "123456789012345678" or "1234567890123456789".
 */
const discordSnowflakePattern = /^\d{17,19}$/;

/**
 * Notification settings for gallery expiration alerts.
 */
export const galleryExpirationNotificationSchema = z.object({
  enabled: z.boolean(),
  channelId: z
    .string()
    .regex(discordSnowflakePattern, "Invalid Discord channel ID format")
    .nullable(),
  daysBefore: z.number().int().min(1).max(30),
});

/**
 * Notification settings section.
 */
export const notificationSettingsSchema = z.object({
  galleryExpiration: galleryExpirationNotificationSchema,
});

/**
 * Guild-level settings configuration.
 * This schema is designed to be easily extendable with additional settings sections.
 */
export const guildSettingsSchema = z.object({
  notifications: notificationSettingsSchema,
});

/**
 * Schema for updating guild settings (partial update support).
 */
export const updateGuildSettingsSchema = z.object({
  guildId: z.string().min(1).max(100),
  settings: guildSettingsSchema,
});

/**
 * Schema for fetching guild settings.
 */
export const getGuildSettingsSchema = z.object({
  guildId: z.string().min(1).max(100),
});
