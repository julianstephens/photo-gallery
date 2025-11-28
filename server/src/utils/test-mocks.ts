/**
 * Shared test mocks for common dependencies.
 * These mocks can be imported and reused across test files to ensure consistency.
 */

import { vi } from "vitest";

/**
 * Mock for environment variables schema.
 * Provides all required environment variables with test values.
 */
export const mockEnv = {
  NODE_ENV: "test",
  LOG_LEVEL: "info",
  PORT: 4000,
  S3_ENDPOINT: "http://s3.test",
  S3_ACCESS_KEY: "test-access",
  S3_SECRET_KEY: "test-secret",
  MASTER_BUCKET_NAME: "master-bucket",
  DISCORD_API_URL: "https://discord.com/api",
  DISCORD_CLIENT_ID: "test-client-id",
  DISCORD_CLIENT_SECRET: "test-client-secret",
  DISCORD_REDIRECT_URI: "http://localhost/callback",
  CLIENT_URL: "http://localhost:3000",
  REDIS_HOST: "localhost",
  REDIS_PORT: 6379,
  REDIS_USER: "test-user",
  REDIS_PASSWORD: "test-password",
  REDIS_DB: 1,
  SESSION_SECRET: "test-session-secret",
  CORS_ORIGINS: "http://localhost:3000",
  CORS_CREDENTIALS: true,
  JSON_LIMIT: "1mb",
  URLENCODED_LIMIT: "1mb",
  ADMIN_USER_IDS: ["admin-user-1", "admin-user-2"],
  GRADIENT_WORKER_ENABLED: false,
  GRADIENT_WORKER_CONCURRENCY: 2,
  GRADIENT_JOB_MAX_RETRIES: 3,
};

/**
 * Mock for the env schema module.
 * Use with: vi.mock("../schemas/env.ts", () => mockEnvModule);
 */
export const mockEnvModule = () => ({
  default: mockEnv,
});

/**
 * Mock for the logger middleware.
 * Provides mocked logger functions that can be spied on.
 */
export const mockLogger = {
  appLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
};

/**
 * Mock for the logger middleware module.
 * Use with: vi.mock("../middleware/logger.ts", () => mockLoggerModule);
 */
export const mockLoggerModule = () => mockLogger;

/**
 * Mock for Redis client.
 * Provides commonly used Redis operations with vi.fn() mocks.
 */
export const mockRedisClient = {
  get: vi.fn(),
  set: vi.fn(),
  hGet: vi.fn(),
  hSet: vi.fn(),
  hGetAll: vi.fn(),
  hDel: vi.fn(),
  del: vi.fn(),
  exists: vi.fn(),
  expire: vi.fn(),
  rPush: vi.fn(),
  lRem: vi.fn(),
  lLen: vi.fn(),
  lMove: vi.fn(),
  sMembers: vi.fn(),
  sAdd: vi.fn(),
  sRem: vi.fn(),
  multi: vi.fn(),
};

/**
 * Mock for the Redis module.
 * Use with: vi.mock("../redis.ts", () => mockRedisModule);
 */
export const mockRedisModule = () => ({
  default: {
    client: mockRedisClient,
  },
});

/**
 * Mock for Axios HTTP client.
 * Provides commonly used HTTP methods with vi.fn() mocks.
 */
export const mockAxios = {
  default: {
    post: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
  },
};

/**
 * Mock for the Axios module.
 * Use with: vi.mock("axios", () => mockAxiosModule);
 */
export const mockAxiosModule = () => mockAxios;

/**
 * Mock for BucketService.
 * Provides all BucketService methods with vi.fn() mocks.
 */
export const mockBucketService = {
  create: vi.fn(),
  createBucketFolder: vi.fn(),
  getBucketFolderContents: vi.fn(),
  uploadBufferToBucket: vi.fn(),
  uploadToBucket: vi.fn(),
  uploadStreamToBucket: vi.fn(),
  deleteObjectFromBucket: vi.fn(),
  deleteBucketFolder: vi.fn(),
  emptyBucketFolder: vi.fn(),
  renameBucketFolder: vi.fn(),
  createPresignedUrl: vi.fn(),
  getObject: vi.fn(),
};

/**
 * Mock for the BucketService module.
 * Use with: vi.mock("../services/bucket.ts", () => mockBucketServiceModule);
 */
export const mockBucketServiceModule = () => ({
  BucketService: vi.fn().mockImplementation(() => mockBucketService),
});

/**
 * Mock for UploadService.
 * Provides UploadService methods with vi.fn() mocks.
 */
export const mockUploadService = {
  isImageMime: vi.fn().mockReturnValue(false),
  isZipMime: vi.fn().mockReturnValue(false),
  sanitizeKeySegment: vi.fn(),
  allowedImageExts: new Set([".jpg", ".png", ".jpeg", ".gif", ".webp"]),
  looksLikeZip: vi.fn().mockReturnValue(true),
};

/**
 * Mock for the UploadService module.
 * Use with: vi.mock("../services/upload.ts", () => mockUploadServiceModule);
 */
export const mockUploadServiceModule = () => ({
  UploadService: vi.fn().mockImplementation(() => mockUploadService),
});

/**
 * Mock for UploadJobService.
 * Provides UploadJobService methods with vi.fn() mocks.
 */
export const mockUploadJobService = {
  createJob: vi.fn(),
  updateJobStatus: vi.fn(),
  updateJobProgress: vi.fn(),
  finalizeJob: vi.fn(),
  getJob: vi.fn(),
  cleanupExpiredUploads: vi.fn(),
  getMetadata: vi.fn(),
  getProgress: vi.fn(),
  updateProgress: vi.fn(),
  markCompleted: vi.fn(),
  markFailed: vi.fn(),
  cleanupProgress: vi.fn(),
};

/**
 * Mock for the UploadJobService module.
 * Use with: vi.mock("../services/uploadJob.ts", () => mockUploadJobServiceModule);
 */
export const mockUploadJobServiceModule = () => ({
  UploadJobService: vi.fn().mockImplementation(() => mockUploadJobService),
});

/**
 * Mock for ChunkedUploadService.
 * Provides ChunkedUploadService methods with vi.fn() mocks.
 */
export const mockChunkedUploadService = {
  initiateUpload: vi.fn(),
  saveChunk: vi.fn(),
  finalizeUpload: vi.fn(),
  cleanupUpload: vi.fn(),
  cleanupExpiredUploads: vi.fn(),
  getMetadata: vi.fn(),
  getProgress: vi.fn(),
  updateProgress: vi.fn(),
  markCompleted: vi.fn(),
  markFailed: vi.fn(),
  cleanupProgress: vi.fn(),
};

/**
 * Mock for the ChunkedUploadService module.
 * Use with: vi.mock("../services/chunkedUpload.ts", () => mockChunkedUploadServiceModule);
 */
export const mockChunkedUploadServiceModule = () => ({
  ChunkedUploadService: vi.fn().mockImplementation(() => mockChunkedUploadService),
});

/**
 * Helper function to reset all mock functions in a mock object.
 * Useful for cleaning up mocks between tests.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function resetAllMocks(mockObj: Record<string, any>): void {
  Object.values(mockObj).forEach((value) => {
    if (typeof value === "function" && "mockReset" in value) {
      value.mockReset();
    } else if (typeof value === "object" && value !== null) {
      resetAllMocks(value);
    }
  });
}
