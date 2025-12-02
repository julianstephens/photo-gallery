import z from "zod";
import type { guildNotificationSettingsSchema, guildSettingsSchema } from "../schemas/guild.ts";

export type GuildNotificationSettings = z.infer<typeof guildNotificationSettingsSchema>;
export type GuildSettings = z.infer<typeof guildSettingsSchema>;
