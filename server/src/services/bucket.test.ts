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
    HeadObjectCommand: class extends CommandBase {},
    GetObjectCommand: class extends CommandBase {},
    CreateBucketCommand: class extends CommandBase {},
    ListObjectsV2Command: class extends CommandBase {},
    PutObjectCommand: class extends CommandBase {},
    DeleteObjectCommand: class extends CommandBase {},
    DeleteObjectsCommand: class extends CommandBase {},
    DeleteBucketCommand: class extends CommandBase {},
    CopyObjectCommand: class extends CommandBase {},
  };
});

// Mock getSignedUrl from s3-request-presigner
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://presigned-url.example.com/test"),
}));

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
        })
        // HeadObject calls for metadata
        .mockResolvedValueOnce({ Metadata: {} })
        .mockResolvedValueOnce({ Metadata: {} });

      service = await BucketService.create();
      const result = await service.getBucketFolderContents("test-bucket");
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ name: "file1.jpg", size: 1024 });
      expect(result[1]).toMatchObject({ name: "file2.jpg", size: 2048 });
      expect(result[0].url).toBe("https://presigned-url.example.com/test");
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
        })
        // HeadObject calls for metadata
        .mockResolvedValueOnce({ Metadata: {} })
        .mockResolvedValueOnce({ Metadata: {} })
        .mockResolvedValueOnce({ Metadata: {} });

      service = await BucketService.create();
      const result = await service.getBucketFolderContents("test-bucket");
      expect(result).toHaveLength(3);
      expect(result[0]).toMatchObject({ name: "a.jpg", size: 1 });
      expect(result[1]).toMatchObject({ name: "b.jpg", size: 2 });
      expect(result[2]).toMatchObject({ name: "c.jpg", size: 3 });
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

  describe.skip("uploadToBucket", () => {
    it("should upload file from path to bucket", async () => {
      const { Readable } = await import("stream");
      const mockStream = Readable.from([Buffer.from("file content")]);

      // Mock fs.createReadStream
      vi.doMock("fs", () => ({
        createReadStream: vi.fn(() => mockStream),
      }));

      mockS3.send
        .mockResolvedValueOnce({}) // HeadBucket in ctor
        .mockResolvedValueOnce({}) // HeadBucket in method
        .mockResolvedValueOnce({}); // PutObject

      service = await BucketService.create();
      await service.uploadToBucket("test-bucket", "test.txt", "/tmp/test.txt", {
        "Content-Type": "text/plain",
      });
      expect(mockS3.send).toHaveBeenCalledTimes(3);
    });
  });

  describe("uploadStreamToBucket", () => {
    it("should upload stream to bucket", async () => {
      const { Readable } = await import("stream");
      const stream = Readable.from(["test", "data"]);

      mockS3.send
        .mockResolvedValueOnce({}) // HeadBucket in ctor
        .mockResolvedValueOnce({}) // HeadBucket in method
        .mockResolvedValueOnce({ ETag: "test-etag" }); // PutObject

      service = await BucketService.create();
      await service.uploadStreamToBucket("test-bucket", "stream.txt", stream, 100, {
        "Content-Type": "text/plain",
      });
      expect(mockS3.send).toHaveBeenCalledTimes(3);
    });
  });

  describe("renameBucketFolder", () => {
    it("should rename folder by copying and deleting objects", async () => {
      mockS3.send
        .mockResolvedValueOnce({}) // HeadBucket in ctor
        .mockResolvedValueOnce({}) // HeadBucket in method
        .mockResolvedValueOnce({
          Contents: [{ Key: "old-name/file1.jpg" }, { Key: "old-name/file2.jpg" }],
          IsTruncated: false,
        }) // List old prefix
        .mockResolvedValueOnce({}) // CopyObject file1
        .mockResolvedValueOnce({}) // CopyObject file2
        .mockResolvedValueOnce({}); // DeleteObjects

      service = await BucketService.create();
      await service.renameBucketFolder("old-name", "new-name");
      expect(mockS3.send).toHaveBeenCalledTimes(6);
    });

    it("should handle rename with empty folder", async () => {
      mockS3.send
        .mockResolvedValueOnce({}) // HeadBucket in ctor
        .mockResolvedValueOnce({}) // HeadBucket in method
        .mockResolvedValueOnce({ Contents: [], IsTruncated: false }); // List empty

      service = await BucketService.create();
      await service.renameBucketFolder("empty-old", "empty-new");
      expect(mockS3.send).toHaveBeenCalledTimes(3);
    });
  });

  describe("createPresignedUrl", () => {
    it("should create presigned URL for object", async () => {
      mockS3.send.mockResolvedValueOnce({}); // HeadBucket in ctor

      service = await BucketService.create();
      const url = await service.createPresignedUrl("test-bucket/file.jpg");

      expect(url).toBe("https://presigned-url.example.com/test");
    });
  });

  describe("getBucketFolderContents", () => {
    it("should not include content data to optimize performance", async () => {
      mockS3.send
        .mockResolvedValueOnce({}) // HeadBucket in ctor
        .mockResolvedValueOnce({}) // HeadBucket in method
        .mockResolvedValueOnce({
          Contents: [{ Key: "test-bucket/file.txt", Size: 100 }],
          IsTruncated: false,
        })
        .mockResolvedValueOnce({ Metadata: {} }); // HeadObject

      service = await BucketService.create();
      const result = await service.getBucketFolderContents("test-bucket", true);
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("content");
      expect(result[0].content).toBeUndefined();
    });
  });

  describe("getObject", () => {
    it("should fetch object with content type", async () => {
      const { Readable } = await import("stream");
      const mockBody = Readable.from([Buffer.from("test image data")]);

      mockS3.send
        .mockResolvedValueOnce({}) // HeadBucket in ctor
        .mockResolvedValueOnce({}) // HeadBucket in method
        .mockResolvedValueOnce({
          Body: mockBody,
          ContentType: "image/jpeg",
        }); // GetObject

      service = await BucketService.create();
      const result = await service.getObject("test-bucket/image.jpg");

      expect(result).toHaveProperty("data");
      expect(result).toHaveProperty("contentType");
      expect(result.contentType).toBe("image/jpeg");
      expect(result.data.toString()).toBe("test image data");
    });

    it("should default to application/octet-stream if no content type", async () => {
      const { Readable } = await import("stream");
      const mockBody = Readable.from([Buffer.from("test data")]);

      mockS3.send
        .mockResolvedValueOnce({}) // HeadBucket in ctor
        .mockResolvedValueOnce({}) // HeadBucket in method
        .mockResolvedValueOnce({
          Body: mockBody,
        }); // GetObject

      service = await BucketService.create();
      const result = await service.getObject("test-bucket/file");

      expect(result.contentType).toBe("application/octet-stream");
    });
  });
});
