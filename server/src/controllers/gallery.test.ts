import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock logger before any imports that might use it
vi.mock("../middleware/logger.ts", () => ({
  appLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock bucket service to avoid env.ts being loaded
vi.mock("../services/bucket.ts", () => ({
  BucketService: vi.fn().mockImplementation(function MockBucketService() {
    return {
      uploadToBucket: vi.fn(),
      uploadStreamToBucket: vi.fn(),
      uploadBufferToBucket: vi.fn(),
      createBucketFolder: vi.fn(),
      renameBucketFolder: vi.fn(),
      emptyBucketFolder: vi.fn(),
      deleteBucketFolder: vi.fn(),
      getBucketFolderContents: vi.fn(),
      getObject: vi.fn(),
      createPresignedUrl: vi.fn(),
    };
  }),
}));

// Mock upload job service
vi.mock("../services/uploadJob.ts", () => ({
  UploadJobService: vi.fn().mockImplementation(function MockUploadJobService() {
    return {
      createJob: vi.fn(),
      updateJobStatus: vi.fn(),
      updateJobProgress: vi.fn(),
      finalizeJob: vi.fn(),
      getJob: vi.fn(),
    };
  }),
}));

import { UploadService } from "../services/upload.ts";
import { GalleryController } from "./gallery.ts";

const redisMocks = vi.hoisted(() => ({
  sMembersMock: vi.fn(),
  multiMock: vi.fn(),
  mGetMock: vi.fn(),
}));

type PipelineOperation = { cmd: string; args: unknown[] };
type Pipeline = {
  ops: PipelineOperation[];
  hGetAll: (key: string) => Pipeline;
  get: (key: string) => Pipeline;
  mGet: (keys: string[]) => Pipeline;
  sRem: (key: string, member: string) => Pipeline;
  sAdd: (key: string, member: string) => Pipeline;
  del: (key: string) => Pipeline;
  zRem: (key: string, member: string) => Pipeline;
  zAdd: (key: string, members: { score: number; value: string }[]) => Pipeline;
  rename: (key: string, newKey: string) => Pipeline;
  set: (key: string, value: string) => Pipeline;
  exists: (key: string) => Pipeline;
  exec: () => Promise<unknown>;
};

const execResults: unknown[] = [];
const pipelines: Pipeline[] = [];
const execCallOrder: PipelineOperation[][] = [];

const createPipeline = (): Pipeline => {
  const ops: PipelineOperation[] = [];
  const pipeline: Pipeline = {
    ops,
    hGetAll(key: string) {
      ops.push({ cmd: "hGetAll", args: [key] });
      return this;
    },
    get(key: string) {
      ops.push({ cmd: "get", args: [key] });
      return this;
    },
    mGet(keys: string[]) {
      ops.push({ cmd: "mGet", args: [keys] });
      return this;
    },
    sRem(key: string, member: string) {
      ops.push({ cmd: "sRem", args: [key, member] });
      return this;
    },
    sAdd(key: string, member: string) {
      ops.push({ cmd: "sAdd", args: [key, member] });
      return this;
    },
    del(key: string) {
      ops.push({ cmd: "del", args: [key] });
      return this;
    },
    zRem(key: string, member: string) {
      ops.push({ cmd: "zRem", args: [key, member] });
      return this;
    },
    zAdd(key: string, members: { score: number; value: string }[]) {
      ops.push({ cmd: "zAdd", args: [key, members] });
      return this;
    },
    rename(key: string, newKey: string) {
      ops.push({ cmd: "rename", args: [key, newKey] });
      return this;
    },
    set(key: string, value: string) {
      ops.push({ cmd: "set", args: [key, value] });
      return this;
    },
    exists(key: string) {
      ops.push({ cmd: "exists", args: [key] });
      return this;
    },
    exec() {
      execCallOrder.push([...ops]);
      return Promise.resolve(execResults.shift());
    },
  };
  pipelines.push(pipeline);
  return pipeline;
};

vi.mock("../redis.ts", () => ({
  default: {
    client: {
      sMembers: redisMocks.sMembersMock,
      multi: redisMocks.multiMock,
      get: vi.fn(),
      mGet: redisMocks.mGetMock,
      set: vi.fn(),
      exists: vi.fn(),
      rename: vi.fn(),
      sAdd: vi.fn(),
      sRem: vi.fn(),
      del: vi.fn(),
      zAdd: vi.fn(),
      zRem: vi.fn(),
    },
    store: {},
  },
}));

describe("GalleryAPI Unit Tests", () => {
  beforeEach(() => {
    execResults.length = 0;
    pipelines.length = 0;
    execCallOrder.length = 0;
    redisMocks.sMembersMock.mockReset();
    redisMocks.multiMock.mockReset();
    redisMocks.multiMock.mockImplementation(() => {
      const pipeline = createPipeline();
      pipelines.push(pipeline);
      return pipeline;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Input validation", () => {
    it("should validate empty strings", () => {
      const validateString = (value: string, errorMessage?: string) => {
        if (!value || value.trim() === "") {
          throw new Error(errorMessage ?? "Input string cannot be empty");
        }
        return value.trim();
      };

      expect(() => validateString("")).toThrow("Input string cannot be empty");
      expect(() => validateString("   ")).toThrow("Input string cannot be empty");
      expect(() => validateString("", "Custom error")).toThrow("Custom error");
      expect(validateString("  test  ")).toBe("test");
    });
  });

  describe("Image file validation", () => {
    it("should identify image MIME types", () => {
      const uploadService = new UploadService();

      expect(uploadService.isImageMime("image/jpeg")).toBe(true);
      expect(uploadService.isImageMime("image/png")).toBe(true);
      expect(uploadService.isImageMime("application/pdf")).toBe(false);
    });

    it("should have correct allowed image extensions", () => {
      const uploadService = new UploadService();

      expect(uploadService.allowedImageExts.has(".jpg")).toBe(true);
      expect(uploadService.allowedImageExts.has(".png")).toBe(true);
      expect(uploadService.allowedImageExts.has(".gif")).toBe(true);
      expect(uploadService.allowedImageExts.has(".pdf")).toBe(false);
    });
  });

  describe("listGalleries", () => {
    it("returns only active galleries and cleans up expired entries", async () => {
      const now = 1_700_000_000_000;
      const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now);

      redisMocks.sMembersMock.mockResolvedValue(["active", "expired"]);

      // Mock mGet to return metadata JSON strings
      redisMocks.mGetMock.mockResolvedValue([
        JSON.stringify({
          createdAt: now - 1_000,
          expiresAt: now + 10_000,
          ttlWeeks: 1,
          createdBy: "user-a",
          totalItems: 0,
        }),
        JSON.stringify({
          createdAt: now - 5_000,
          expiresAt: now - 100,
          ttlWeeks: 1,
          createdBy: "user-b",
          totalItems: 0,
        }),
      ]);

      // Mock cleanup operations
      execResults.push([]);
      redisMocks.multiMock.mockReturnValue(createPipeline());

      const controller = new GalleryController();
      const result = await controller.listGalleries("guild-123");

      expect(result).toEqual([
        {
          name: "active",
          meta: {
            createdAt: now - 1_000,
            expiresAt: now + 10_000,
            ttlWeeks: 1,
            createdBy: "user-a",
            totalItems: 0,
          },
        },
      ]);

      expect(pipelines).toHaveLength(1);
      const cleanupOps = pipelines[0].ops;
      expect(cleanupOps).toEqual([
        { cmd: "sRem", args: ["guild:guild-123:galleries", "expired"] },
        { cmd: "del", args: ["guild:guild-123:gallery:expired:meta"] },
        { cmd: "zRem", args: ["galleries:expiries:v2", "guild:guild-123:gallery:expired"] },
      ]);
      expect(execCallOrder).toHaveLength(1);
      expect(execCallOrder[0]).toEqual(cleanupOps);

      nowSpy.mockRestore();
    });

    it("short-circuits when no galleries exist", async () => {
      redisMocks.sMembersMock.mockResolvedValue([]);
      const controller = new GalleryController();
      const result = await controller.listGalleries("guild-123");
      expect(result).toEqual([]);
      expect(redisMocks.multiMock).not.toHaveBeenCalled();
    });
  });

  describe("normalizeGalleryFolderName - test utility", () => {
    it("converts special characters to hyphens", async () => {
      const { normalizeGalleryFolderName } = await import("../utils.ts");
      expect(normalizeGalleryFolderName("My Awesome Gallery")).toBe("my-awesome-gallery");
    });

    it("handles multiple consecutive special characters", async () => {
      const { normalizeGalleryFolderName } = await import("../utils.ts");
      expect(normalizeGalleryFolderName("My!!!Gallery###2025")).toBe("my-gallery-2025");
    });

    it("removes leading and trailing hyphens", async () => {
      const { normalizeGalleryFolderName } = await import("../utils.ts");
      expect(normalizeGalleryFolderName("---MyGallery---")).toBe("mygallery");
    });

    it("uses default 'gallery' when all characters are stripped", async () => {
      const { normalizeGalleryFolderName } = await import("../utils.ts");
      expect(normalizeGalleryFolderName("!!!###$$$")).toBe("gallery");
    });

    it("converts to lowercase", async () => {
      const { normalizeGalleryFolderName } = await import("../utils.ts");
      expect(normalizeGalleryFolderName("MYGallery_2025")).toBe("mygallery-2025");
    });

    it("handles real-world examples", async () => {
      const { normalizeGalleryFolderName } = await import("../utils.ts");
      expect(normalizeGalleryFolderName("Random Pics")).toBe("random-pics");
      expect(normalizeGalleryFolderName("My 2025 Vacation!")).toBe("my-2025-vacation");
      expect(normalizeGalleryFolderName("Annual Photo Review (2025)")).toBe(
        "annual-photo-review-2025",
      );
    });
  });
});
