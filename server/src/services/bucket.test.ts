import { beforeEach, describe, expect, it, vi } from "vitest";
import { BucketService } from "./bucket.ts";

// Mock env for S3
vi.mock("../schemas/env.ts", () => ({
  default: {
    S3_ENDPOINT: "http://s3.test",
    S3_ACCESS_KEY: "test-access",
    S3_SECRET_KEY: "test-secret",
    MASTER_BUCKET_NAME: "master-bucket",
    DISCORD_CLIENT_ID: "id",
    DISCORD_CLIENT_SECRET: "secret",
    DISCORD_REDIRECT_URI: "http://localhost/callback",
    PORT: "4000",
  },
}));

// Minimal AWS SDK v3 S3 mock
const mockS3 = { send: vi.fn() };

vi.mock("@aws-sdk/client-s3", () => {
  class CommandBase<T = unknown> {
    input: T;
    constructor(input: T) {
      this.input = input;
    }
  }
  return {
    S3Client: class {
      send = mockS3.send;
    },
    HeadBucketCommand: class extends CommandBase {},
    CreateBucketCommand: class extends CommandBase {},
    ListObjectsV2Command: class extends CommandBase {},
    PutObjectCommand: class extends CommandBase {},
    DeleteObjectCommand: class extends CommandBase {},
    DeleteObjectsCommand: class extends CommandBase {},
    DeleteBucketCommand: class extends CommandBase {},
  };
});

describe("BucketService", () => {
  let service: BucketService;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should reject if master bucket is missing on create", async () => {
    mockS3.send.mockRejectedValueOnce(new Error("NotFound"));
    await expect(BucketService.create()).rejects.toThrow(
      'Master bucket "master-bucket" is missing or inaccessible',
    );
  });

  describe("createBucketFolder", () => {
    it("should create master bucket if missing and create folder marker", async () => {
      mockS3.send
        .mockResolvedValueOnce({}) // HeadBucket in ctor
        .mockResolvedValueOnce({}); // PutObject folder marker

      service = await BucketService.create();
      await expect(service.createBucketFolder("test-bucket")).resolves.toBeUndefined();
      expect(mockS3.send).toHaveBeenCalledTimes(2);

      const calls = mockS3.send.mock.calls;
      expect(calls[1][0].input).toMatchObject({
        Bucket: "master-bucket",
        Key: "test-bucket/",
      });
    });

    it("should create folder marker when master bucket exists", async () => {
      mockS3.send
        .mockResolvedValueOnce({}) // HeadBucket in ctor
        .mockResolvedValueOnce({}); // PutObject folder marker

      service = await BucketService.create();
      await expect(service.createBucketFolder("exists")).resolves.toBeUndefined();
      expect(mockS3.send).toHaveBeenCalledTimes(2);

      const calls = mockS3.send.mock.calls;
      expect(calls[1][0].input).toMatchObject({
        Bucket: "master-bucket",
        Key: "exists/",
      });
    });
  });

  describe("getBucketFolderContents", () => {
    it("should return bucket contents", async () => {
      mockS3.send
        .mockResolvedValueOnce({}) // HeadBucket in ctor
        .mockResolvedValueOnce({}) // HeadBucket in method
        .mockResolvedValueOnce({
          Contents: [
            { Key: "test-bucket/file1.jpg", Size: 1024 },
            { Key: "test-bucket/file2.jpg", Size: 2048 },
          ],
          IsTruncated: false,
        });

      service = await BucketService.create();
      const result = await service.getBucketFolderContents("test-bucket");
      expect(result).toEqual([
        { name: "file1.jpg", size: 1024 },
        { name: "file2.jpg", size: 2048 },
      ]);
      expect(mockS3.send).toHaveBeenCalledTimes(3);
    });

    it("should propagate list errors", async () => {
      mockS3.send
        .mockResolvedValueOnce({}) // HeadBucket in ctor
        .mockResolvedValueOnce({}) // HeadBucket in method
        .mockRejectedValueOnce(new Error("List error"));

      service = await BucketService.create();
      await expect(service.getBucketFolderContents("test-bucket")).rejects.toThrow("List error");
    });

    it("should paginate through multiple pages", async () => {
      mockS3.send
        .mockResolvedValueOnce({}) // HeadBucket in ctor
        .mockResolvedValueOnce({}) // HeadBucket in method
        .mockResolvedValueOnce({
          Contents: [{ Key: "test-bucket/a.jpg", Size: 1 }],
          IsTruncated: true,
          NextContinuationToken: "t1",
        })
        .mockResolvedValueOnce({
          Contents: [
            { Key: "test-bucket/b.jpg", Size: 2 },
            { Key: "test-bucket/c.jpg", Size: 3 },
          ],
          IsTruncated: false,
        });

      service = await BucketService.create();
      const result = await service.getBucketFolderContents("test-bucket");
      expect(result).toEqual([
        { name: "a.jpg", size: 1 },
        { name: "b.jpg", size: 2 },
        { name: "c.jpg", size: 3 },
      ]);
      expect(mockS3.send).toHaveBeenCalledTimes(4);
    });
  });

  describe("uploadBufferToBucket", () => {
    it("should upload buffer to bucket", async () => {
      mockS3.send
        .mockResolvedValueOnce({}) // HeadBucket in ctor
        .mockResolvedValueOnce({}) // HeadBucket in method
        .mockResolvedValueOnce({}); // PutObject

      const buffer = Buffer.from("test data");
      const meta = { "Content-Type": "image/jpeg", foo: "bar" };

      service = await BucketService.create();
      await service.uploadBufferToBucket("test-bucket", "test.jpg", buffer, meta);
      expect(mockS3.send).toHaveBeenCalledTimes(3);

      const calls = mockS3.send.mock.calls;
      expect(calls[2][0].input).toMatchObject({
        Bucket: "master-bucket",
        Key: "test-bucket/test.jpg",
        ContentLength: buffer.length,
      });
    });
  });

  describe("deleteObjectFromBucket", () => {
    it("should delete object from bucket", async () => {
      mockS3.send
        .mockResolvedValueOnce({}) // HeadBucket in ctor
        .mockResolvedValueOnce({}) // HeadBucket in method
        .mockResolvedValueOnce({}); // DeleteObject

      service = await BucketService.create();
      await service.deleteObjectFromBucket("test-bucket", "test.jpg");
      expect(mockS3.send).toHaveBeenCalledTimes(3);

      const calls = mockS3.send.mock.calls;
      expect(calls[2][0].input).toMatchObject({
        Bucket: "master-bucket",
        Key: "test-bucket/test.jpg",
      });
    });
  });

  describe("deleteBucketFolder", () => {
    it("should delete bucket folder marker", async () => {
      mockS3.send
        .mockResolvedValueOnce({}) // HeadBucket in ctor
        .mockResolvedValueOnce({}) // HeadBucket in method
        .mockResolvedValueOnce({}); // DeleteObject folder marker

      service = await BucketService.create();
      await service.deleteBucketFolder("test-bucket");
      expect(mockS3.send).toHaveBeenCalledTimes(3);

      const calls = mockS3.send.mock.calls;
      expect(calls[2][0].input).toMatchObject({
        Bucket: "master-bucket",
        Key: "test-bucket/",
      });
    });
  });

  describe("emptyBucketFolder", () => {
    it("should empty bucket with objects", async () => {
      mockS3.send
        .mockResolvedValueOnce({}) // HeadBucket in ctor
        .mockResolvedValueOnce({}) // HeadBucket in method
        .mockResolvedValueOnce({
          Contents: [{ Key: "test-bucket/file1.jpg" }, { Key: "test-bucket/file2.jpg" }],
          IsTruncated: false,
        }) // List with prefix
        .mockResolvedValueOnce({}) // DeleteObjects
        .mockResolvedValueOnce({}); // Delete folder marker

      service = await BucketService.create();
      await service.emptyBucketFolder("test-bucket");
      expect(mockS3.send).toHaveBeenCalledTimes(5);
      const calls = mockS3.send.mock.calls;
      expect(calls[4][0].input).toMatchObject({
        Bucket: "master-bucket",
        Key: "test-bucket/",
      });
    });

    it("should handle empty bucket", async () => {
      mockS3.send
        .mockResolvedValueOnce({}) // HeadBucket in ctor
        .mockResolvedValueOnce({}) // HeadBucket in method
        .mockResolvedValueOnce({ Contents: [], IsTruncated: false }) // List
        .mockResolvedValueOnce({}); // Delete folder marker

      service = await BucketService.create();
      await service.emptyBucketFolder("test-bucket");
      expect(mockS3.send).toHaveBeenCalledTimes(4);
      const calls = mockS3.send.mock.calls;
      expect(calls[3][0].input).toMatchObject({
        Bucket: "master-bucket",
        Key: "test-bucket/",
      });
    });

    it("should paginate and delete in batches", async () => {
      mockS3.send
        .mockResolvedValueOnce({}) // HeadBucket in ctor
        .mockResolvedValueOnce({}) // HeadBucket in method
        .mockResolvedValueOnce({
          Contents: [{ Key: "test-bucket/f1.jpg" }],
          IsTruncated: true,
          NextContinuationToken: "t1",
        }) // List page 1
        .mockResolvedValueOnce({
          Contents: [{ Key: "test-bucket/f2.jpg" }, { Key: "test-bucket/f3.jpg" }],
          IsTruncated: false,
        }) // List page 2
        .mockResolvedValueOnce({}) // DeleteObjects (single batch here)
        .mockResolvedValueOnce({}); // Delete folder marker
      service = await BucketService.create();
      await service.emptyBucketFolder("test-bucket");
      expect(mockS3.send).toHaveBeenCalledTimes(6);
      const calls = mockS3.send.mock.calls;
      // Verify DeleteObjects received 3 keys combined
      const delInput = calls[4][0].input;
      expect(delInput.Delete.Objects).toHaveLength(3);
      expect(calls[5][0].input).toMatchObject({
        Bucket: "master-bucket",
        Key: "test-bucket/",
      });
    });
  });
});
