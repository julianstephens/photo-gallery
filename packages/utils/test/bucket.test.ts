import { GetObjectCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { Readable } from "stream";
import { beforeEach, describe, expect, it } from "vitest";
import { BucketMissingError, BucketService, type BucketServiceConfig } from "../src/bucket/index";

// Mock S3 client
const s3Mock = mockClient(S3Client);

// Default test configuration
const testConfig: BucketServiceConfig = {
  endpoint: "http://localhost:9000",
  accessKeyId: "test-access-key",
  secretAccessKey: "test-secret-key",
  bucketName: "test-bucket",
  region: "us-east-1",
  forcePathStyle: true,
};

describe("BucketService", () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  describe("constructor", () => {
    it("should create a BucketService with provided config", () => {
      const service = new BucketService(testConfig);
      expect(service).toBeDefined();
      expect(service.getBucketName()).toBe("test-bucket");
    });

    it("should use default region and forcePathStyle if not provided", () => {
      const minimalConfig: BucketServiceConfig = {
        endpoint: "http://localhost:9000",
        accessKeyId: "key",
        secretAccessKey: "secret",
        bucketName: "bucket",
      };
      const service = new BucketService(minimalConfig);
      expect(service).toBeDefined();
      expect(service.getBucketName()).toBe("bucket");
    });
  });

  describe("ensureBucket", () => {
    it("should resolve when bucket exists", async () => {
      s3Mock.on(HeadBucketCommand).resolves({});

      const service = new BucketService(testConfig);
      await expect(service.ensureBucket()).resolves.toBeUndefined();
    });

    it("should throw BucketMissingError when bucket does not exist", async () => {
      s3Mock.on(HeadBucketCommand).rejects(new Error("NotFound"));

      const service = new BucketService(testConfig);
      await expect(service.ensureBucket()).rejects.toThrow(BucketMissingError);
      await expect(service.ensureBucket()).rejects.toThrow('Bucket "test-bucket" does not exist');
    });

    it("should throw BucketMissingError for any S3 error", async () => {
      s3Mock.on(HeadBucketCommand).rejects(new Error("AccessDenied"));

      const service = new BucketService(testConfig);
      await expect(service.ensureBucket()).rejects.toThrow(BucketMissingError);
    });
  });

  describe("getObject", () => {
    it("should fetch object with content type", async () => {
      const mockBody = Readable.from([Buffer.from("test image data")]);

      s3Mock.on(HeadBucketCommand).resolves({});
      s3Mock.on(GetObjectCommand).resolves({
        Body: mockBody as unknown as Readable,
        ContentType: "image/jpeg",
      });

      const service = new BucketService(testConfig);
      const result = await service.getObject("path/to/image.jpg");

      expect(result).toHaveProperty("data");
      expect(result).toHaveProperty("contentType");
      expect(result.contentType).toBe("image/jpeg");
      expect(result.data.toString()).toBe("test image data");
    });

    it("should default to application/octet-stream if no content type", async () => {
      const mockBody = Readable.from([Buffer.from("test data")]);

      s3Mock.on(HeadBucketCommand).resolves({});
      s3Mock.on(GetObjectCommand).resolves({
        Body: mockBody as unknown as Readable,
        // No ContentType specified
      });

      const service = new BucketService(testConfig);
      const result = await service.getObject("path/to/file");

      expect(result.contentType).toBe("application/octet-stream");
    });

    it("should return empty buffer if no body", async () => {
      s3Mock.on(HeadBucketCommand).resolves({});
      s3Mock.on(GetObjectCommand).resolves({
        ContentType: "application/octet-stream",
        // No Body
      });

      const service = new BucketService(testConfig);
      const result = await service.getObject("path/to/empty");

      expect(result.data.length).toBe(0);
    });

    it("should throw BucketMissingError if bucket check fails", async () => {
      s3Mock.on(HeadBucketCommand).rejects(new Error("NotFound"));

      const service = new BucketService(testConfig);
      await expect(service.getObject("any/key")).rejects.toThrow(BucketMissingError);
    });

    it("should propagate S3 errors on getObject", async () => {
      s3Mock.on(HeadBucketCommand).resolves({});
      s3Mock.on(GetObjectCommand).rejects(new Error("AccessDenied"));

      const service = new BucketService(testConfig);
      await expect(service.getObject("path/to/denied")).rejects.toThrow("AccessDenied");
    });

    it("should handle multi-chunk stream data", async () => {
      const chunk1 = Buffer.from("Hello ");
      const chunk2 = Buffer.from("World");
      const mockBody = Readable.from([chunk1, chunk2]);

      s3Mock.on(HeadBucketCommand).resolves({});
      s3Mock.on(GetObjectCommand).resolves({
        Body: mockBody as unknown as Readable,
        ContentType: "text/plain",
      });

      const service = new BucketService(testConfig);
      const result = await service.getObject("multi-chunk.txt");

      expect(result.data.toString()).toBe("Hello World");
    });

    it("should use correct bucket name and key in request", async () => {
      const mockBody = Readable.from([Buffer.from("data")]);

      s3Mock.on(HeadBucketCommand).resolves({});
      s3Mock.on(GetObjectCommand).resolves({
        Body: mockBody as unknown as Readable,
        ContentType: "text/plain",
      });

      const service = new BucketService(testConfig);
      await service.getObject("gallery/uploads/photo.jpg");

      const getObjectCalls = s3Mock.commandCalls(GetObjectCommand);
      expect(getObjectCalls).toHaveLength(1);
      expect(getObjectCalls[0].args[0].input).toMatchObject({
        Bucket: "test-bucket",
        Key: "gallery/uploads/photo.jpg",
      });
    });
  });

  describe("getS3Client", () => {
    it("should return the underlying S3 client", () => {
      const service = new BucketService(testConfig);
      const client = service.getS3Client();

      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(S3Client);
    });
  });

  describe("getBucketName", () => {
    it("should return the configured bucket name", () => {
      const service = new BucketService(testConfig);
      expect(service.getBucketName()).toBe("test-bucket");

      const customConfig = { ...testConfig, bucketName: "custom-bucket" };
      const customService = new BucketService(customConfig);
      expect(customService.getBucketName()).toBe("custom-bucket");
    });
  });
});

describe("BucketMissingError", () => {
  it("should create error with bucket name in message", () => {
    const error = new BucketMissingError("my-bucket");
    expect(error.message).toBe('Bucket "my-bucket" does not exist');
    expect(error.name).toBe("BucketMissingError");
  });

  it("should create error without bucket name", () => {
    const error = new BucketMissingError();
    expect(error.message).toBe("Bucket does not exist");
    expect(error.name).toBe("BucketMissingError");
  });

  it("should be instanceof Error", () => {
    const error = new BucketMissingError("test");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(BucketMissingError);
  });
});
