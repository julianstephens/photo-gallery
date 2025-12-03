import type { RedisClientType } from "redis";
import type { GradientStatus, ImageGradient, StoredGradient } from "utils";
import type { Logger } from "./logger.js";

const GRADIENT_PREFIX = "gradient:";
const GRADIENT_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

/**
 * Service for managing gradient metadata storage in Redis.
 */
export class GradientMetaService {
  #redis: RedisClientType;

  constructor(redis: RedisClientType, _logger: Logger) {
    this.#redis = redis;
  }

  #buildKey = (storageKey: string) => `${GRADIENT_PREFIX}${storageKey}`;

  /**
   * Get stored gradient metadata for an image.
   */
  getGradient = async (storageKey: string): Promise<StoredGradient | null> => {
    const key = this.#buildKey(storageKey);
    const data = await this.#redis.get(key);
    if (!data) return null;

    try {
      return JSON.parse(data) as StoredGradient;
    } catch {
      return null;
    }
  };

  /**
   * Set gradient metadata for an image.
   */
  setGradient = async (
    storageKey: string,
    status: GradientStatus,
    gradient?: ImageGradient,
    error?: string,
  ): Promise<void> => {
    const key = this.#buildKey(storageKey);
    const now = Date.now();

    const existing = await this.getGradient(storageKey);
    const stored: StoredGradient = {
      status,
      gradient,
      attempts: existing?.attempts ?? 0,
      lastError: error,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await this.#redis.set(key, JSON.stringify(stored));
    await this.#redis.expire(key, GRADIENT_TTL_SECONDS);
  };

  /**
   * Mark gradient generation as pending (queued).
   */
  markPending = async (storageKey: string): Promise<void> => {
    const existing = await this.getGradient(storageKey);
    // Don't overwrite if already completed
    if (existing?.status === "completed") return;

    await this.setGradient(storageKey, "pending");
  };

  /**
   * Mark gradient generation as in progress.
   */
  markProcessing = async (storageKey: string): Promise<void> => {
    const key = this.#buildKey(storageKey);
    const existing = await this.getGradient(storageKey);
    if (!existing) return;

    const stored: StoredGradient = {
      ...existing,
      status: "processing",
      updatedAt: Date.now(),
    };

    await this.#redis.set(key, JSON.stringify(stored));
    await this.#redis.expire(key, GRADIENT_TTL_SECONDS);
  };

  /**
   * Mark gradient generation as completed with the gradient data.
   */
  markCompleted = async (storageKey: string, gradient: ImageGradient): Promise<void> => {
    await this.setGradient(storageKey, "completed", gradient);
  };

  /**
   * Mark gradient generation as failed.
   */
  markFailed = async (storageKey: string, error: string): Promise<void> => {
    await this.setGradient(storageKey, "failed", undefined, error);
  };
}
