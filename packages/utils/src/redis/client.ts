import { createClient, type RedisClientType } from "redis";
import pino from "pino";

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

export const redisClient: RedisClientType = createClient({
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
redisClient.on("connect", () => log.info("Client connecting..."));
redisClient.on("ready", () => log.info("Client connected successfully and is ready to use."));
redisClient.on("reconnecting", () => log.warn("Client is attempting to reconnect..."));
redisClient.on("error", (err) => log.error({ err }, "Redis Client Error"));
redisClient.on("end", () => log.info("Connection closed. No more reconnections will be made."));

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
  await redisClient.connect();
  isInitialized = true;
}

/**
 * Gracefully disconnects the Redis client.
 * This should be called once during application shutdown.
 */
export async function disconnectRedis() {
  if (redisClient.isOpen) {
    await redisClient.quit();
    isInitialized = false;
  }
}
