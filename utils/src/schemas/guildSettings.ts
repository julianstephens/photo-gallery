import { z } from "zod";

/**
 * Notification settings for gallery expiration alerts.
 */
export const galleryExpirationNotificationSchema = z.object({
  enabled: z.boolean(),
  channelId: z.string().nullable(),
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
