import { beforeEach, describe, expect, it, vi } from "vitest";

// Use vi.hoisted to define mocks that need to be accessed in vi.mock factories
const {
  mockRedisClient,
  mockBucketService,
  mockMarkProcessing,
  mockMarkCompleted,
  mockMarkFailed,
} = vi.hoisted(() => ({
  mockRedisClient: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    expire: vi.fn(),
    rPush: vi.fn(),
    lRem: vi.fn(),
    lLen: vi.fn(),
    lMove: vi.fn(),
    zAdd: vi.fn(),
    zRem: vi.fn(),
    zCard: vi.fn(),
    zRangeByScore: vi.fn(),
  },
  mockBucketService: {
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
  },
  mockMarkPending: vi.fn(),
  mockMarkProcessing: vi.fn(),
  mockMarkCompleted: vi.fn(),
  mockMarkFailed: vi.fn(),
  mockGetGradient: vi.fn(),
}));

// Set up mocks BEFORE any imports - inline all data since vi.mock is hoisted
vi.mock("../schemas/env.ts", () => ({
  default: {
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
    GRADIENT_WORKER_ENABLED: true,
    GRADIENT_WORKER_CONCURRENCY: 2,
    GRADIENT_JOB_MAX_RETRIES: 3,
    GRADIENT_WORKER_POLL_INTERVAL_MS: 1000,
  },
}));

vi.mock("../middleware/logger.ts", () => ({
  appLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../redis.ts", () => ({
  default: {
    client: mockRedisClient,
  },
}));

vi.mock("../services/bucket.ts", () => ({
  BucketService: vi.fn().mockImplementation(function MockBucketService() {
    return mockBucketService;
  }),
}));

vi.mock("../services/gradientMeta.ts", () => ({
  GradientMetaService: vi.fn().mockImplementation(function MockGradientMetaService() {
    return {
      markPending: vi.fn(),
      markProcessing: mockMarkProcessing,
      markCompleted: mockMarkCompleted,
      markFailed: mockMarkFailed,
      getGradient: vi.fn(),
    };
  }),
}));

// Mock utils gradient generation - must use inline function to avoid hoisting issues
vi.mock("utils/server", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    generateGradientWithPlaceholder: vi.fn(),
  };
});

// Import after mocks - get access to the mocked function
import { generateGradientWithPlaceholder } from "utils/server";
const mockGenerateGradient = vi.mocked(generateGradientWithPlaceholder);

// Import the function under test AFTER all mocks are set up
import { processJob } from "./gradient.ts";

describe("GradientWorker - processJob", () => {
  const validJobData = {
    guildId: "guild123",
    galleryName: "test-gallery",
    storageKey: "test/image.jpg",
    itemId: "test-image-jpg",
    jobId: "gradient-test-image.jpg",
    attempts: 0,
    createdAt: Date.now(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateGradient.mockResolvedValue({
      palette: ["#FF0000", "#00FF00"],
      primary: "#FF0000",
      secondary: "#00FF00",
      foreground: "#FFFFFF",
      css: "linear-gradient(135deg, #FF0000 0%, #00FF00 100%)",
      placeholder: "data:image/jpeg;base64,test",
    });
  });

  it("should skip processing when job data is not found", async () => {
    mockRedisClient.get.mockResolvedValue(null);

    await processJob("gradient-test-image.jpg");

    expect(mockMarkProcessing).not.toHaveBeenCalled();
    expect(mockMarkCompleted).not.toHaveBeenCalled();
  });

  it("should delete job when job data is invalid JSON", async () => {
    mockRedisClient.get.mockResolvedValue("invalid-json");

    await processJob("gradient-test-image.jpg");

    expect(mockRedisClient.del).toHaveBeenCalledWith("gradient:job:gradient-test-image.jpg");
    expect(mockMarkProcessing).not.toHaveBeenCalled();
  });

  it("should successfully process a job and mark it completed", async () => {
    mockRedisClient.get.mockResolvedValue(JSON.stringify(validJobData));
    mockBucketService.getObject.mockResolvedValue({
      data: Buffer.from("fake-image-data"),
      contentLength: 100,
      contentType: "image/jpeg",
    });

    await processJob("gradient-test-image.jpg");

    expect(mockMarkProcessing).toHaveBeenCalledWith("test/image.jpg");
    expect(mockBucketService.getObject).toHaveBeenCalledWith("test/image.jpg");
    expect(mockGenerateGradient).toHaveBeenCalled();
    expect(mockMarkCompleted).toHaveBeenCalledWith(
      "test/image.jpg",
      expect.objectContaining({
        primary: "#FF0000",
        secondary: "#00FF00",
      }),
    );
    expect(mockRedisClient.del).toHaveBeenCalledWith("gradient:job:gradient-test-image.jpg");
    expect(mockRedisClient.lRem).toHaveBeenCalledWith(
      "gradient:processing",
      0,
      "gradient-test-image.jpg",
    );
  });

  it("should schedule delayed retry when job fails and retries remaining", async () => {
    mockRedisClient.get.mockResolvedValue(JSON.stringify({ ...validJobData, attempts: 0 }));
    mockBucketService.getObject.mockRejectedValue(new Error("S3 download failed"));

    await processJob("gradient-test-image.jpg");

    expect(mockMarkProcessing).toHaveBeenCalledWith("test/image.jpg");
    expect(mockRedisClient.lRem).toHaveBeenCalledWith(
      "gradient:processing",
      0,
      "gradient-test-image.jpg",
    );
    // Should schedule for delayed retry using Redis sorted set
    expect(mockRedisClient.zAdd).toHaveBeenCalledWith(
      "gradient:delayed",
      expect.objectContaining({ value: "gradient-test-image.jpg" }),
    );
    expect(mockMarkFailed).not.toHaveBeenCalled();
  });

  it("should mark as failed after max retries are reached", async () => {
    // Set attempts to 2 (max retries is 3, so next attempt is 3 which equals max)
    mockRedisClient.get.mockResolvedValue(JSON.stringify({ ...validJobData, attempts: 2 }));
    mockBucketService.getObject.mockRejectedValue(new Error("S3 download failed"));

    await processJob("gradient-test-image.jpg");

    expect(mockMarkFailed).toHaveBeenCalledWith("test/image.jpg", "S3 download failed");
    expect(mockRedisClient.del).toHaveBeenCalledWith("gradient:job:gradient-test-image.jpg");
    // Should NOT schedule for delayed retry
    expect(mockRedisClient.zAdd).not.toHaveBeenCalled();
  });

  it("should handle empty image buffer and retry", async () => {
    mockRedisClient.get.mockResolvedValue(JSON.stringify(validJobData));
    mockBucketService.getObject.mockResolvedValue({
      data: Buffer.alloc(0), // Empty buffer
      contentLength: 0,
      contentType: "image/jpeg",
    });

    await processJob("gradient-test-image.jpg");

    expect(mockMarkProcessing).toHaveBeenCalledWith("test/image.jpg");
    expect(mockMarkCompleted).not.toHaveBeenCalled();
    // Should schedule for delayed retry since buffer was empty
    expect(mockRedisClient.zAdd).toHaveBeenCalledWith(
      "gradient:delayed",
      expect.objectContaining({ value: "gradient-test-image.jpg" }),
    );
  });

  it("should handle gradient generation failure and retry", async () => {
    mockRedisClient.get.mockResolvedValue(JSON.stringify(validJobData));
    mockBucketService.getObject.mockResolvedValue({
      data: Buffer.from("fake-image-data"),
      contentLength: 100,
      contentType: "image/jpeg",
    });
    mockGenerateGradient.mockRejectedValue(new Error("Gradient generation failed"));

    await processJob("gradient-test-image.jpg");

    expect(mockMarkProcessing).toHaveBeenCalledWith("test/image.jpg");
    expect(mockMarkCompleted).not.toHaveBeenCalled();
    // Should schedule for delayed retry
    expect(mockRedisClient.zAdd).toHaveBeenCalledWith(
      "gradient:delayed",
      expect.objectContaining({ value: "gradient-test-image.jpg" }),
    );
  });
});
