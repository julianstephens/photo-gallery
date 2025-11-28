import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockEnvModule } from "../utils/test-mocks.ts";
import { BucketService } from "./bucket.ts";

// Mock env for S3
vi.mock("../schemas/env.ts", () => mockEnvModule());

// Mock S3 client
const s3Mock = mockClient(S3Client);

// Mock getSignedUrl from s3-request-presigner
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://presigned-url.example.com/test"),
}));

describe("BucketService", () => {
  let service: BucketService;

  beforeEach(() => {
    s3Mock.reset();
  });

  it("should reject if master bucket is missing on create", async () => {
    s3Mock.on(HeadBucketCommand).rejectsOnce(new Error("NotFound"));
    await expect(BucketService.create()).rejects.toThrow(
      'Master bucket "master-bucket" is missing or inaccessible',
    );
  });

  describe("createBucketFolder", () => {
    it("should create master bucket if missing and create folder marker", async () => {
      s3Mock.on(HeadBucketCommand).resolves({});
      s3Mock.on(PutObjectCommand).resolves({});

      service = await BucketService.create();
      await expect(service.createBucketFolder("test-bucket")).resolves.toBeUndefined();

      const putCalls = s3Mock.commandCalls(PutObjectCommand);
      expect(putCalls).toHaveLength(1);
      expect(putCalls[0].args[0].input).toMatchObject({
        Bucket: "master-bucket",
        Key: "test-bucket/",
      });
    });

    it("should create folder marker when master bucket exists", async () => {
      s3Mock.on(HeadBucketCommand).resolves({});
      s3Mock.on(PutObjectCommand).resolves({});

      service = await BucketService.create();
      await expect(service.createBucketFolder("exists")).resolves.toBeUndefined();

      const putCalls = s3Mock.commandCalls(PutObjectCommand);
      expect(putCalls).toHaveLength(1);
      expect(putCalls[0].args[0].input).toMatchObject({
        Bucket: "master-bucket",
        Key: "exists/",
      });
    });
  });

  describe("getBucketFolderContents", () => {
    it("should return bucket contents", async () => {
      s3Mock.on(HeadBucketCommand).resolves({});
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: [
          { Key: "test-bucket/file1.jpg", Size: 1024 },
          { Key: "test-bucket/file2.jpg", Size: 2048 },
        ],
        IsTruncated: false,
      });
      s3Mock.on(HeadObjectCommand).resolves({ Metadata: {} });

      service = await BucketService.create();
      const result = await service.getBucketFolderContents("test-bucket");
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ name: "file1.jpg", size: 1024 });
      expect(result[1]).toMatchObject({ name: "file2.jpg", size: 2048 });
      // url now returns the raw key, not a presigned URL
      expect(result[0].url).toBe("test-bucket/file1.jpg");
    });

    it("should propagate list errors", async () => {
      s3Mock.on(HeadBucketCommand).resolves({});
      s3Mock.on(ListObjectsV2Command).rejects(new Error("List error"));

      service = await BucketService.create();
      await expect(service.getBucketFolderContents("test-bucket")).rejects.toThrow("List error");
    });

    it("should paginate through multiple pages", async () => {
      s3Mock.on(HeadBucketCommand).resolves({});
      s3Mock
        .on(ListObjectsV2Command)
        .resolvesOnce({
          Contents: [{ Key: "test-bucket/a.jpg", Size: 1 }],
          IsTruncated: true,
          NextContinuationToken: "t1",
        })
        .resolvesOnce({
          Contents: [
            { Key: "test-bucket/b.jpg", Size: 2 },
            { Key: "test-bucket/c.jpg", Size: 3 },
          ],
          IsTruncated: false,
        });
      s3Mock.on(HeadObjectCommand).resolves({ Metadata: {} });

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
      s3Mock.on(HeadBucketCommand).resolves({});
      s3Mock.on(PutObjectCommand).resolves({});

      const buffer = Buffer.from("test data");
      const meta = { "Content-Type": "image/jpeg", foo: "bar" };

      service = await BucketService.create();
      await service.uploadBufferToBucket("test-bucket", "test.jpg", buffer, meta);

      const putCalls = s3Mock.commandCalls(PutObjectCommand);
      expect(putCalls).toHaveLength(1);
      expect(putCalls[0].args[0].input).toMatchObject({
        Bucket: "master-bucket",
        Key: "test-bucket/test.jpg",
        ContentLength: buffer.length,
      });
    });
  });

  describe("deleteObjectFromBucket", () => {
    it("should delete object from bucket", async () => {
      s3Mock.on(HeadBucketCommand).resolves({});
      s3Mock.on(DeleteObjectCommand).resolves({});

      service = await BucketService.create();
      await service.deleteObjectFromBucket("test-bucket", "test.jpg");

      const deleteCalls = s3Mock.commandCalls(DeleteObjectCommand);
      expect(deleteCalls).toHaveLength(1);
      expect(deleteCalls[0].args[0].input).toMatchObject({
        Bucket: "master-bucket",
        Key: "test-bucket/test.jpg",
      });
    });
  });

  describe("deleteBucketFolder", () => {
    it("should delete bucket folder marker", async () => {
      s3Mock.on(HeadBucketCommand).resolves({});
      s3Mock.on(DeleteObjectCommand).resolves({});

      service = await BucketService.create();
      await service.deleteBucketFolder("test-bucket");

      const deleteCalls = s3Mock.commandCalls(DeleteObjectCommand);
      expect(deleteCalls).toHaveLength(1);
      expect(deleteCalls[0].args[0].input).toMatchObject({
        Bucket: "master-bucket",
        Key: "test-bucket/",
      });
    });
  });

  describe("emptyBucketFolder", () => {
    it("should empty bucket with objects", async () => {
      s3Mock.on(HeadBucketCommand).resolves({});
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: [{ Key: "test-bucket/file1.jpg" }, { Key: "test-bucket/file2.jpg" }],
        IsTruncated: false,
      });
      s3Mock.on(DeleteObjectsCommand).resolves({});
      s3Mock.on(DeleteObjectCommand).resolves({});

      service = await BucketService.create();
      await service.emptyBucketFolder("test-bucket");

      const deleteObjCalls = s3Mock.commandCalls(DeleteObjectCommand);
      expect(deleteObjCalls).toHaveLength(1);
      expect(deleteObjCalls[0].args[0].input).toMatchObject({
        Bucket: "master-bucket",
        Key: "test-bucket/",
      });
    });

    it("should handle empty bucket", async () => {
      s3Mock.on(HeadBucketCommand).resolves({});
      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [], IsTruncated: false });
      s3Mock.on(DeleteObjectCommand).resolves({});

      service = await BucketService.create();
      await service.emptyBucketFolder("test-bucket");

      const deleteObjCalls = s3Mock.commandCalls(DeleteObjectCommand);
      expect(deleteObjCalls).toHaveLength(1);
      expect(deleteObjCalls[0].args[0].input).toMatchObject({
        Bucket: "master-bucket",
        Key: "test-bucket/",
      });
    });

    it("should paginate and delete in batches", async () => {
      s3Mock.on(HeadBucketCommand).resolves({});
      s3Mock
        .on(ListObjectsV2Command)
        .resolvesOnce({
          Contents: [{ Key: "test-bucket/f1.jpg" }],
          IsTruncated: true,
          NextContinuationToken: "t1",
        })
        .resolvesOnce({
          Contents: [{ Key: "test-bucket/f2.jpg" }, { Key: "test-bucket/f3.jpg" }],
          IsTruncated: false,
        });
      s3Mock.on(DeleteObjectsCommand).resolves({});
      s3Mock.on(DeleteObjectCommand).resolves({});

      service = await BucketService.create();
      await service.emptyBucketFolder("test-bucket");

      const deleteObjsCalls = s3Mock.commandCalls(DeleteObjectsCommand);
      expect(deleteObjsCalls).toHaveLength(1);
      const delInput = deleteObjsCalls[0].args[0].input;
      expect(delInput.Delete.Objects).toHaveLength(3);

      const deleteObjCalls = s3Mock.commandCalls(DeleteObjectCommand);
      expect(deleteObjCalls).toHaveLength(1);
      expect(deleteObjCalls[0].args[0].input).toMatchObject({
        Bucket: "master-bucket",
        Key: "test-bucket/",
      });
    });
  });

  describe("uploadToBucket", () => {
    it("should upload file from path to bucket", async () => {
      // Create a temporary file for testing
      const { writeFileSync, unlinkSync } = await import("fs");
      const { tmpdir } = await import("os");
      const path = await import("path");
      const testFilePath = path.join(tmpdir(), "test-upload-file.txt");

      try {
        writeFileSync(testFilePath, "test file content");

        s3Mock.on(HeadBucketCommand).resolves({});
        s3Mock.on(PutObjectCommand).resolves({ ETag: "test-etag" });

        service = await BucketService.create();
        await service.uploadToBucket("test-bucket", "test.txt", testFilePath, {
          "Content-Type": "text/plain",
        });
      } finally {
        // Clean up the temporary file
        try {
          unlinkSync(testFilePath);
        } catch {
          // Ignore cleanup errors
        }
      }
    });
  });

  describe("uploadStreamToBucket", () => {
    it("should upload stream to bucket", async () => {
      const { Readable } = await import("stream");
      const stream = Readable.from(["test", "data"]);

      s3Mock.on(HeadBucketCommand).resolves({});
      s3Mock.on(PutObjectCommand).resolves({ ETag: "test-etag" });

      service = await BucketService.create();
      await service.uploadStreamToBucket("test-bucket", "stream.txt", stream, 100, {
        "Content-Type": "text/plain",
      });
    });
  });

  describe("renameBucketFolder", () => {
    it("should rename folder by copying and deleting objects", async () => {
      s3Mock.on(HeadBucketCommand).resolves({});
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: [{ Key: "old-name/file1.jpg" }, { Key: "old-name/file2.jpg" }],
        IsTruncated: false,
      });
      s3Mock.on(CopyObjectCommand).resolves({});
      s3Mock.on(DeleteObjectsCommand).resolves({});

      service = await BucketService.create();
      await service.renameBucketFolder("old-name", "new-name");
    });

    it("should handle rename with empty folder", async () => {
      s3Mock.on(HeadBucketCommand).resolves({});
      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [], IsTruncated: false });

      service = await BucketService.create();
      await service.renameBucketFolder("empty-old", "empty-new");
    });
  });

  describe("createPresignedUrl", () => {
    it("should create presigned URL for object", async () => {
      s3Mock.on(HeadBucketCommand).resolves({});

      service = await BucketService.create();
      const url = await service.createPresignedUrl("test-bucket/file.jpg");

      expect(url).toBe("https://presigned-url.example.com/test");
    });
  });

  describe("getBucketFolderContents", () => {
    it("should not include content data to optimize performance", async () => {
      s3Mock.on(HeadBucketCommand).resolves({});
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: [{ Key: "test-bucket/file.txt", Size: 100 }],
        IsTruncated: false,
      });
      s3Mock.on(HeadObjectCommand).resolves({ Metadata: {} });

      service = await BucketService.create();
      const result = await service.getBucketFolderContents("test-bucket", true);
      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty("content");
      expect(result[0]).toHaveProperty("name");
      expect(result[0]).toHaveProperty("url");
      expect(result[0]).toHaveProperty("metadata");
    });
  });

  describe("getObject", () => {
    it("should fetch object with content type", async () => {
      const { Readable } = await import("stream");
      const mockBody = Readable.from([Buffer.from("test image data")]);

      s3Mock.on(HeadBucketCommand).resolves({});
      s3Mock.on(GetObjectCommand).resolves({
        Body: mockBody,
        ContentType: "image/jpeg",
      });

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

      s3Mock.on(HeadBucketCommand).resolves({});
      s3Mock.on(GetObjectCommand).resolves({
        Body: mockBody,
      });

      service = await BucketService.create();
      const result = await service.getObject("test-bucket/file");

      expect(result.contentType).toBe("application/octet-stream");
    });
  });
});
