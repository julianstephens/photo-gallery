import { describe, it, expect, beforeEach, vi } from "vitest";
import { BucketService } from "./bucket.ts";

// Mock the env module to avoid needing environment variables
vi.mock("../schemas/env.ts", () => ({
  default: {
    MINIO_ENDPOINT: "test.minio.com",
    MINIO_PORT: 9000,
    MINIO_ACCESS_KEY: "test-access-key",
    MINIO_SECRET_KEY: "test-secret-key",
  },
}));

// Create a mock Minio client
const mockMinioClient = {
  bucketExists: vi.fn(),
  makeBucket: vi.fn(),
  listObjectsV2: vi.fn(),
  fPutObject: vi.fn(),
  putObject: vi.fn(),
  removeObject: vi.fn(),
  removeBucket: vi.fn(),
  removeObjects: vi.fn(),
};

// Mock the Minio module
vi.mock("minio", () => {
  return {
    Client: class {
      bucketExists = mockMinioClient.bucketExists;
      makeBucket = mockMinioClient.makeBucket;
      listObjectsV2 = mockMinioClient.listObjectsV2;
      fPutObject = mockMinioClient.fPutObject;
      putObject = mockMinioClient.putObject;
      removeObject = mockMinioClient.removeObject;
      removeBucket = mockMinioClient.removeBucket;
      removeObjects = mockMinioClient.removeObjects;
    },
  };
});

describe("BucketService", () => {
  let service: BucketService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BucketService();
  });

  describe("createBucket", () => {
    it("should create a bucket when it does not exist", async () => {
      mockMinioClient.bucketExists.mockResolvedValue(false);
      mockMinioClient.makeBucket.mockResolvedValue(undefined);

      await expect(service.createBucket("test-bucket")).rejects.toThrow();
      expect(mockMinioClient.bucketExists).toHaveBeenCalledWith("test-bucket");
    });

    it("should create bucket when it exists", async () => {
      mockMinioClient.bucketExists.mockResolvedValue(true);
      mockMinioClient.makeBucket.mockResolvedValue(undefined);

      await service.createBucket("test-bucket");
      expect(mockMinioClient.bucketExists).toHaveBeenCalledWith("test-bucket");
      expect(mockMinioClient.makeBucket).toHaveBeenCalledWith("test-bucket");
    });
  });

  describe("getBucketContents", () => {
    it("should return bucket contents", async () => {
      mockMinioClient.bucketExists.mockResolvedValue(true);

      const mockObjects = [
        { name: "file1.jpg", size: 1024 },
        { name: "file2.jpg", size: 2048 },
      ];

      const mockStream = {
        on: vi.fn().mockImplementation((event, callback) => {
          if (event === "data") {
            mockObjects.forEach((obj) => callback(obj));
          } else if (event === "end") {
            callback();
          }
          return mockStream;
        }),
      };

      mockMinioClient.listObjectsV2.mockReturnValue(mockStream);

      const result = await service.getBucketContents("test-bucket");
      expect(result).toEqual(mockObjects);
      expect(mockMinioClient.bucketExists).toHaveBeenCalledWith("test-bucket");
      expect(mockMinioClient.listObjectsV2).toHaveBeenCalledWith("test-bucket", "", true);
    });

    it("should handle errors from stream", async () => {
      mockMinioClient.bucketExists.mockResolvedValue(true);

      const mockError = new Error("Stream error");
      const mockStream = {
        on: vi.fn().mockImplementation((event, callback) => {
          if (event === "error") {
            callback(mockError);
          }
          return mockStream;
        }),
      };

      mockMinioClient.listObjectsV2.mockReturnValue(mockStream);

      await expect(service.getBucketContents("test-bucket")).rejects.toThrow("Stream error");
    });
  });

  describe("uploadBufferToBucket", () => {
    it("should upload buffer to bucket", async () => {
      mockMinioClient.bucketExists.mockResolvedValue(true);
      mockMinioClient.putObject.mockResolvedValue(undefined);

      const buffer = Buffer.from("test data");
      const meta = { "Content-Type": "image/jpeg" };

      await service.uploadBufferToBucket("test-bucket", "test.jpg", buffer, meta);

      expect(mockMinioClient.bucketExists).toHaveBeenCalledWith("test-bucket");
      expect(mockMinioClient.putObject).toHaveBeenCalledWith(
        "test-bucket",
        "test.jpg",
        buffer,
        buffer.length,
        meta,
      );
    });
  });

  describe("deleteObjectFromBucket", () => {
    it("should delete object from bucket", async () => {
      mockMinioClient.bucketExists.mockResolvedValue(true);
      mockMinioClient.removeObject.mockResolvedValue(undefined);

      await service.deleteObjectFromBucket("test-bucket", "test.jpg");

      expect(mockMinioClient.bucketExists).toHaveBeenCalledWith("test-bucket");
      expect(mockMinioClient.removeObject).toHaveBeenCalledWith("test-bucket", "test.jpg");
    });
  });

  describe("deleteBucket", () => {
    it("should delete bucket", async () => {
      mockMinioClient.bucketExists.mockResolvedValue(true);
      mockMinioClient.removeBucket.mockResolvedValue(undefined);

      await service.deleteBucket("test-bucket");

      expect(mockMinioClient.bucketExists).toHaveBeenCalledWith("test-bucket");
      expect(mockMinioClient.removeBucket).toHaveBeenCalledWith("test-bucket");
    });
  });

  describe("emptyBucket", () => {
    it("should empty bucket with objects", async () => {
      mockMinioClient.bucketExists.mockResolvedValue(true);

      const mockObjects = [{ name: "file1.jpg" }, { name: "file2.jpg" }];

      const mockStream = {
        on: vi.fn().mockImplementation((event, callback) => {
          if (event === "data") {
            mockObjects.forEach((obj) => callback(obj));
          } else if (event === "end") {
            callback();
          }
          return mockStream;
        }),
      };

      mockMinioClient.listObjectsV2.mockReturnValue(mockStream);
      mockMinioClient.removeObjects.mockResolvedValue(undefined);

      await service.emptyBucket("test-bucket");

      expect(mockMinioClient.removeObjects).toHaveBeenCalledWith("test-bucket", [
        "file1.jpg",
        "file2.jpg",
      ]);
    });

    it("should handle empty bucket", async () => {
      mockMinioClient.bucketExists.mockResolvedValue(true);

      const mockStream = {
        on: vi.fn().mockImplementation((event, callback) => {
          if (event === "end") {
            callback();
          }
          return mockStream;
        }),
      };

      mockMinioClient.listObjectsV2.mockReturnValue(mockStream);

      await service.emptyBucket("test-bucket");

      expect(mockMinioClient.removeObjects).not.toHaveBeenCalled();
    });
  });
});
