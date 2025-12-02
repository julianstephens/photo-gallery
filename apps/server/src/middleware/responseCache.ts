import type { NextFunction, Request, Response } from "express";
import redis from "../redis.ts";
import { appLogger } from "./logger.ts";

// Default TTL for cached responses in seconds (5 minutes)
const DEFAULT_CACHE_TTL_SECONDS = 5 * 60;

// Prefix for cache keys
const CACHE_PREFIX = "cache:response:";

interface CacheOptions {
  ttlSeconds?: number;
  keyGenerator?: (req: Request) => string;
}

/**
 * Generates a cache key based on the request.
 * Default strategy: uses the original URL (path + query string) and userId from session.
 */
const defaultKeyGenerator = (req: Request): string => {
  const userId = req.session?.userId ?? "anonymous";
  // Include guildId if present in query params for gallery endpoints
  const guildId = (req.query?.guildId as string) ?? "";
  const baseKey = `${req.method}:${req.originalUrl}`;
  return `${CACHE_PREFIX}${baseKey}:user:${userId}${guildId ? `:guild:${guildId}` : ""}`;
};

/**
 * Middleware factory that creates a response caching middleware.
 * Caches successful GET responses in Redis with a configurable TTL.
 *
 * @param options - Configuration options for the cache
 * @returns Express middleware function
 */
export const createResponseCache = (options: CacheOptions = {}) => {
  const { ttlSeconds = DEFAULT_CACHE_TTL_SECONDS, keyGenerator = defaultKeyGenerator } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Only cache GET requests
    if (req.method !== "GET") {
      return next();
    }

    const cacheKey = keyGenerator(req);

    try {
      // Try to get cached response
      const cachedResponse = await redis.client.get(cacheKey);

      if (cachedResponse) {
        appLogger.debug({ cacheKey }, "[responseCache] Cache hit");
        const parsed = JSON.parse(cachedResponse);
        res.status(parsed.statusCode || 200);
        res.set("X-Cache", "HIT");
        res.json(parsed.body);
        return;
      }
    } catch (err) {
      // On Redis error, just proceed without cache
      appLogger.warn(
        { err, cacheKey },
        "[responseCache] Redis get error, proceeding without cache",
      );
    }

    // Store original res.json to intercept the response
    const originalJson = res.json.bind(res);

    // Set X-Cache header before response override happens
    res.set("X-Cache", "MISS");

    res.json = (body: unknown): Response => {
      // Only cache successful responses (2xx status codes)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const cachePayload = JSON.stringify({
          statusCode: res.statusCode,
          body,
        });

        redis.client
          .setEx(cacheKey, ttlSeconds, cachePayload)
          .then(() => {
            appLogger.debug({ cacheKey, ttlSeconds }, "[responseCache] Response cached");
          })
          .catch((err) => {
            appLogger.warn({ err, cacheKey }, "[responseCache] Failed to cache response");
          });
      }

      return originalJson(body);
    };

    next();
  };
};

/**
 * Pre-configured cache middleware for default guild endpoint.
 * Uses a shorter TTL since this is user-specific and may change more frequently.
 */
export const defaultGuildCache = createResponseCache({
  ttlSeconds: 5 * 60, // 5 minutes
  keyGenerator: (req: Request): string => {
    const userId = req.session?.userId ?? "anonymous";
    return `${CACHE_PREFIX}guilds:default:user:${userId}`;
  },
});

/**
 * Pre-configured cache middleware for galleries list endpoint.
 * Uses the guildId from query params as part of the cache key.
 */
export const galleriesCache = createResponseCache({
  ttlSeconds: 5 * 60, // 5 minutes
  keyGenerator: (req: Request): string => {
    const userId = req.session?.userId ?? "anonymous";
    const guildId = (req.query?.guildId as string) ?? "unknown";
    return `${CACHE_PREFIX}galleries:list:guild:${guildId}:user:${userId}`;
  },
});

/**
 * Invalidates cache for a specific user's galleries.
 * Should be called when galleries are created, updated, or deleted.
 */
export const invalidateGalleriesCache = async (guildId: string, userId?: string): Promise<void> => {
  try {
    // Pattern to match all gallery cache keys for this guild
    const pattern = `${CACHE_PREFIX}galleries:list:guild:${guildId}:*`;

    // Use SCAN to avoid blocking Redis (unlike KEYS which blocks)
    let cursor = 0;
    const keys: string[] = [];
    do {
      const result = await redis.client.scan(cursor, { MATCH: pattern, COUNT: 100 });
      cursor = result.cursor;
      if (result.keys.length > 0) {
        keys.push(...result.keys);
      }
    } while (cursor !== 0);

    if (keys.length > 0) {
      await redis.client.del(keys);
      appLogger.debug(
        { guildId, userId, deletedKeys: keys.length },
        "[responseCache] Invalidated galleries cache",
      );
    }
  } catch (err) {
    appLogger.warn(
      { err, guildId, userId },
      "[responseCache] Failed to invalidate galleries cache",
    );
  }
};

/**
 * Invalidates cache for a specific user's default guild.
 * Should be called when the default guild is changed.
 */
export const invalidateDefaultGuildCache = async (userId: string): Promise<void> => {
  try {
    const cacheKey = `${CACHE_PREFIX}guilds:default:user:${userId}`;
    await redis.client.del(cacheKey);
    appLogger.debug({ userId, cacheKey }, "[responseCache] Invalidated default guild cache");
  } catch (err) {
    appLogger.warn({ err, userId }, "[responseCache] Failed to invalidate default guild cache");
  }
};
