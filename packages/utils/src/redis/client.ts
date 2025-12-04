import pino from "pino";
import { createClient, type RedisClientType } from "redis";

const MAX_RETRIES = 10;
const INITIAL_BACKOFF_MS = 500; // Start with a 500ms delay
const MAX_BACKOFF_MS = 5000; // Cap the delay at 5 seconds
const JITTER_MS = 100; // Add up to 100ms of random jitter

const log = pino({
  name: "redis-client",
  base: {
    service: "photo-gallery-redis",
  },
  level: process.env.LOG_LEVEL || "info",
});

// Lazy-loaded Redis client. This defers creation until the client is first accessed,
// allowing REDIS_URL to be set from environment variables first.
let redisClientInstance: RedisClientType | null = null;

function getRedisClient(): RedisClientType {
  if (!redisClientInstance) {
    const url = process.env.REDIS_URL || "redis://localhost:6379";
    log.info({ url: url.replace(/:[^@]*@/, ":***@") }, "[Redis] Creating client with REDIS_URL");
    redisClientInstance = createClient({
      url: process.env.REDIS_URL || "redis://localhost:6379",
      socket: {
        reconnectStrategy: (retries: number): number | Error => {
          if (retries >= MAX_RETRIES) {
            return new Error("Max reconnection attempts reached. Closing client.");
          }

          const backoff = Math.min(INITIAL_BACKOFF_MS * 2 ** retries, MAX_BACKOFF_MS);
          const delayWithJitter = backoff + Math.floor(Math.random() * JITTER_MS);

          log.warn(`Reconnecting in ${delayWithJitter}ms (attempt #${retries + 1})`);
          return delayWithJitter;
        },
      },
    });

    // --- Event Listeners for Observability ---
    redisClientInstance.on("connect", () => log.info("Client connecting..."));
    redisClientInstance.on("ready", () =>
      log.info("Client connected successfully and is ready to use."),
    );
    redisClientInstance.on("reconnecting", () => log.warn("Client is attempting to reconnect..."));
    redisClientInstance.on("error", (err) => log.error({ err }, "Redis Client Error"));
    redisClientInstance.on("end", () =>
      log.info("Connection closed. No more reconnections will be made."),
    );
  }

  return redisClientInstance;
}

// Export a getter that returns the lazily-loaded client
export const redisClient: RedisClientType = new Proxy({} as RedisClientType, {
  get: (_, prop) => {
    return Reflect.get(getRedisClient(), prop);
  },
});

// --- Connection Management Functions ---
let isInitialized = false;

/**
 * Connects the Redis client. Throws an error if the initial connection fails.
 * This should be called once at application startup.
 */
export async function initializeRedis() {
  if (isInitialized) {
    log.warn("Client is already initialized. Skipping.");
    return;
  }
  const client = getRedisClient();
  await client.connect();
  isInitialized = true;
}

/**
 * Gracefully disconnects the Redis client.
 * This should be called once during application shutdown.
 */
export async function disconnectRedis() {
  if (!redisClientInstance) {
    return;
  }
  if (redisClientInstance.isOpen) {
    await redisClientInstance.quit();
    isInitialized = false;
  }
}
