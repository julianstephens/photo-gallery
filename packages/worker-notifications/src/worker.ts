import type { RedisClientType } from "redis";
import { guildSettingsSchema, type GalleryMeta, type GuildSettings } from "utils";
import type { Env } from "./env";
import type { Logger } from "./logger";

// Redis key patterns
const GUILD_SETTINGS_KEY = (guildId: string) => `guilds:${guildId}:settings`;
const GUILD_GALLERIES_KEY = (guildId: string) => `guild:${guildId}:galleries`;
const GALLERY_META_KEY = (guildId: string, galleryName: string) =>
  `guild:${guildId}:gallery:${galleryName}:meta`;
const NOTIFIED_KEY = (guildId: string, galleryName: string, daysBefore: number) =>
  `guilds:${guildId}:notified:${galleryName}:${daysBefore}`;

// TTL for notification records (30 days)
const NOTIFIED_TTL_SECONDS = 30 * 24 * 60 * 60;

// Permanent webhook error codes that should mark webhook as invalid
const PERMANENT_WEBHOOK_ERRORS = [404, 410];

// Discord webhook URL pattern for validation
const DISCORD_WEBHOOK_PATTERN =
  /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[\w-]+$/;

// Webhook request timeout in milliseconds
const WEBHOOK_TIMEOUT_MS = 10000;

interface WorkerStats {
  guildsProcessed: number;
  galleriesChecked: number;
  notificationsSent: number;
  notificationsSkipped: number;
  webhookErrors: number;
  invalidWebhooksMarked: number;
}

interface ExpiringGallery {
  name: string;
  expiresAt: number;
  createdBy: string;
  totalItems: number;
}

interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  fields: Array<{ name: string; value: string; inline?: boolean }>;
  timestamp: string;
}

interface DiscordWebhookPayload {
  embeds: DiscordEmbed[];
}

/**
 * Gallery Expiration Notification Worker
 *
 * This worker scans all guilds for galleries expiring in a configurable number of days
 * and sends Discord webhook notifications. It is designed to be run as an ephemeral
 * container triggered by an external scheduler.
 */
export class NotificationWorker {
  private redis: RedisClientType;
  private logger: Logger;
  private env: Env;
  private stats: WorkerStats;

  constructor(redis: RedisClientType, logger: Logger, env: Env) {
    this.redis = redis;
    this.logger = logger;
    this.env = env;
    this.stats = {
      guildsProcessed: 0,
      galleriesChecked: 0,
      notificationsSent: 0,
      notificationsSkipped: 0,
      webhookErrors: 0,
      invalidWebhooksMarked: 0,
    };
  }

  /**
   * Run the notification worker.
   * Returns true if successful, false if there were fatal errors.
   */
  async run(): Promise<boolean> {
    this.logger.info("Starting notification worker run");

    try {
      const guildIds = await this.discoverGuilds();
      this.logger.info({ guildCount: guildIds.length }, "Discovered guilds");

      for (const guildId of guildIds) {
        try {
          await this.processGuild(guildId);
          this.stats.guildsProcessed++;
        } catch (error) {
          this.logger.error(
            { guildId, error: error instanceof Error ? error.message : String(error) },
            "Failed to process guild",
          );
          // Continue processing other guilds
        }
      }

      this.logger.info(
        {
          stats: this.stats,
        },
        "Notification worker run completed",
      );

      return true;
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Fatal error in notification worker",
      );
      return false;
    }
  }

  /**
   * Discover all guilds that have settings configured.
   */
  private async discoverGuilds(): Promise<string[]> {
    const pattern = "guilds:*:settings";
    const guildIds: string[] = [];

    let cursor = "0";
    do {
      const scanResult = await this.redis.scan(cursor, { MATCH: pattern, COUNT: 100 });
      cursor = scanResult.cursor.toString();
      const keys = scanResult.keys;

      for (const key of keys) {
        // Extract guildId from key: guilds:{guildId}:settings
        const match = key.match(/^guilds:([^:]+):settings$/);
        if (match && match[1]) {
          guildIds.push(match[1]);
        }
      }
    } while (cursor !== "0");

    return guildIds;
  }

  /**
   * Process a single guild: check settings and send notifications for expiring galleries.
   */
  private async processGuild(guildId: string): Promise<void> {
    this.logger.debug({ guildId }, "Processing guild");

    // Get guild settings
    const settings = await this.getGuildSettings(guildId);
    if (!settings?.notifications?.enabled) {
      this.logger.debug({ guildId }, "Notifications not enabled for guild");
      return;
    }

    const { webhookUrl, daysBefore } = settings.notifications;
    if (!webhookUrl) {
      this.logger.debug({ guildId }, "No webhook URL configured for guild");
      return;
    }

    const effectiveDaysBefore = daysBefore ?? this.env.DEFAULT_DAYS_BEFORE;

    // Validate webhook URL is a Discord webhook
    if (!DISCORD_WEBHOOK_PATTERN.test(webhookUrl)) {
      this.logger.warn({ guildId }, "Invalid webhook URL format, must be a Discord webhook URL");
      return;
    }

    // Find galleries expiring in exactly daysBefore days
    const expiringGalleries = await this.findExpiringGalleries(guildId, effectiveDaysBefore);
    this.logger.debug(
      { guildId, expiringCount: expiringGalleries.length, daysBefore: effectiveDaysBefore },
      "Found expiring galleries",
    );

    if (expiringGalleries.length === 0) {
      return;
    }

    // Filter out already notified galleries (idempotency) using batched pipeline
    const toNotify: ExpiringGallery[] = [];
    const existsMulti = this.redis.multi();
    for (const gallery of expiringGalleries) {
      const notifiedKey = NOTIFIED_KEY(guildId, gallery.name, effectiveDaysBefore);
      existsMulti.exists(notifiedKey);
    }
    const existsResults = await existsMulti.exec();

    for (let i = 0; i < expiringGalleries.length; i++) {
      const gallery = expiringGalleries[i];
      const alreadyNotified = existsResults?.[i];

      if (alreadyNotified) {
        this.stats.notificationsSkipped++;
        this.logger.debug(
          { guildId, galleryName: gallery.name },
          "Gallery already notified, skipping",
        );
      } else {
        toNotify.push(gallery);
      }
    }

    if (toNotify.length === 0) {
      return;
    }

    // Send webhook notification
    const success = await this.sendWebhookNotification(
      guildId,
      webhookUrl,
      toNotify,
      effectiveDaysBefore,
    );

    if (success) {
      // Mark galleries as notified (batched)
      const setexMulti = this.redis.multi();
      for (const gallery of toNotify) {
        const notifiedKey = NOTIFIED_KEY(guildId, gallery.name, effectiveDaysBefore);
        setexMulti.setEx(notifiedKey, NOTIFIED_TTL_SECONDS, Date.now().toString());
      }
      await setexMulti.exec();
      this.stats.notificationsSent += toNotify.length;
    }
  }

  /**
   * Get and parse guild settings from Redis.
   */
  private async getGuildSettings(guildId: string): Promise<GuildSettings | null> {
    const key = GUILD_SETTINGS_KEY(guildId);
    const data = await this.redis.get(key);

    if (!data) {
      return null;
    }

    try {
      const parsed = JSON.parse(data);
      const result = guildSettingsSchema.safeParse(parsed);

      if (!result.success) {
        this.logger.warn(
          { guildId, errors: result.error.flatten() },
          "Invalid guild settings schema",
        );
        return null;
      }

      return result.data;
    } catch (error) {
      this.logger.warn(
        { guildId, error: error instanceof Error ? error.message : String(error) },
        "Failed to parse guild settings",
      );
      return null;
    }
  }

  /**
   * Find galleries expiring in exactly daysBefore days.
   */
  private async findExpiringGalleries(
    guildId: string,
    daysBefore: number,
  ): Promise<ExpiringGallery[]> {
    const galleriesKey = GUILD_GALLERIES_KEY(guildId);
    const galleryNames = await this.redis.sMembers(galleriesKey);

    if (galleryNames.length === 0) {
      return [];
    }

    const now = Date.now();
    const targetDay = now + daysBefore * 24 * 60 * 60 * 1000;
    const dayStart = new Date(targetDay);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(targetDay);
    dayEnd.setUTCHours(23, 59, 59, 999);

    const expiringGalleries: ExpiringGallery[] = [];

    // Batch fetch gallery metadata
    const multi = this.redis.multi();
    for (const name of galleryNames) {
      multi.get(GALLERY_META_KEY(guildId, name));
    }

    const results = await multi.exec();

    for (let i = 0; i < galleryNames.length; i++) {
      const galleryName = galleryNames[i];
      const result = results?.[i];
      this.stats.galleriesChecked++;

      if (!result) {
        this.logger.warn({ guildId, galleryName }, "Gallery metadata is null");
        continue;
      }

      try {
        const meta = JSON.parse(result as unknown as string) as GalleryMeta;
        const expiresAt = meta.expiresAt;

        // Check if gallery expires on the target day
        if (expiresAt >= dayStart.getTime() && expiresAt <= dayEnd.getTime()) {
          expiringGalleries.push({
            name: galleryName,
            expiresAt,
            createdBy: meta.createdBy,
            totalItems: meta.totalItems ?? 0,
          });
        }
      } catch {
        this.logger.warn({ guildId, galleryName }, "Failed to parse gallery metadata");
      }
    }

    return expiringGalleries;
  }

  /**
   * Send a Discord webhook notification for expiring galleries.
   */
  private async sendWebhookNotification(
    guildId: string,
    webhookUrl: string,
    galleries: ExpiringGallery[],
    daysBefore: number,
  ): Promise<boolean> {
    const embed: DiscordEmbed = {
      title: "Gallery Expiration Notice",
      description:
        galleries.length === 1
          ? `The following gallery will expire in ${daysBefore} day${daysBefore === 1 ? "" : "s"}:`
          : `The following ${galleries.length} galleries will expire in ${daysBefore} day${daysBefore === 1 ? "" : "s"}:`,
      color: 0xffa500, // Orange color for warning
      fields: galleries.map((gallery) => ({
        name: gallery.name,
        value: `Photos: ${gallery.totalItems} | Expires: <t:${Math.floor(gallery.expiresAt / 1000)}:R>`,
        inline: false,
      })),
      timestamp: new Date().toISOString(),
    };

    const payload: DiscordWebhookPayload = {
      embeds: [embed],
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const status = response.status;
        this.stats.webhookErrors++;

        // Check for permanent errors
        if (PERMANENT_WEBHOOK_ERRORS.includes(status)) {
          this.logger.warn(
            { guildId, status },
            "Webhook returned permanent error, marking as invalid",
          );
          await this.markWebhookInvalid(guildId, status);
          this.stats.invalidWebhooksMarked++;
          return false;
        }

        this.logger.error({ guildId, status }, "Webhook request failed");
        return false;
      }

      this.logger.info(
        { guildId, galleriesNotified: galleries.length },
        "Successfully sent webhook notification",
      );
      return true;
    } catch (error) {
      this.stats.webhookErrors++;
      this.logger.error(
        { guildId, error: error instanceof Error ? error.message : String(error) },
        "Failed to send webhook notification",
      );
      return false;
    }
  }

  /**
   * Mark a webhook as invalid in guild settings for admin review.
   */
  private async markWebhookInvalid(guildId: string, errorCode: number): Promise<void> {
    const key = GUILD_SETTINGS_KEY(guildId);
    const data = await this.redis.get(key);

    if (!data) {
      return;
    }

    try {
      const settings = JSON.parse(data) as GuildSettings;

      if (settings.notifications) {
        // Add invalid marker for admin attention
        const updatedSettings = {
          ...settings,
          notifications: {
            ...settings.notifications,
            webhookInvalid: true,
            webhookErrorCode: errorCode,
            webhookErrorAt: Date.now(),
          },
        };

        await this.redis.set(key, JSON.stringify(updatedSettings));
        this.logger.info({ guildId, errorCode }, "Marked webhook as invalid");
      }
    } catch (error) {
      this.logger.error(
        { guildId, error: error instanceof Error ? error.message : String(error) },
        "Failed to mark webhook as invalid",
      );
    }
  }

  /**
   * Get final statistics from the worker run.
   */
  getStats(): WorkerStats {
    return { ...this.stats };
  }
}
