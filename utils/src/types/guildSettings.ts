import type z from "zod";
import type {
  galleryExpirationNotificationSchema,
  getGuildSettingsSchema,
  guildSettingsSchema,
  notificationSettingsSchema,
  updateGuildSettingsSchema,
} from "../schemas/guildSettings.ts";

export type GalleryExpirationNotification = z.infer<typeof galleryExpirationNotificationSchema>;

export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

export type GuildSettings = z.infer<typeof guildSettingsSchema>;

export type UpdateGuildSettingsRequest = z.infer<typeof updateGuildSettingsSchema>;

export type GetGuildSettingsRequest = z.infer<typeof getGuildSettingsSchema>;

/**
 * Default guild settings used when no settings exist for a guild.
 */
export const DEFAULT_GUILD_SETTINGS: GuildSettings = {
  notifications: {
    galleryExpiration: {
      enabled: false,
      webhookUrl: undefined,
      daysBefore: 3,
    },
  },
};
