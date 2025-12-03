import { GetObjectCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import type { Readable } from "stream";

/**
 * Error thrown when the bucket does not exist or is inaccessible.
 */
export class BucketMissingError extends Error {
  constructor(bucketName?: string) {
    super(bucketName ? `Bucket "${bucketName}" does not exist` : "Bucket does not exist");
    this.name = "BucketMissingError";
  }
}

/**
 * Configuration for the BucketService.
 */
export interface BucketServiceConfig {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  region?: string;
  forcePathStyle?: boolean;
}

/**
 * Shared bucket service for S3-compatible storage operations.
 * This minimal service provides getObject functionality needed by workers.
 */
export class BucketService {
  #s3: S3Client;
  #bucketName: string;

  constructor(config: BucketServiceConfig) {
    this.#s3 = new S3Client({
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      region: config.region ?? "garage",
      forcePathStyle: config.forcePathStyle ?? true,
    });
    this.#bucketName = config.bucketName;
  }

  /**
   * Verify that the bucket exists and is accessible.
   * @throws {BucketMissingError} if the bucket does not exist
   */
  async ensureBucket(): Promise<void> {
    try {
      await this.#s3.send(new HeadBucketCommand({ Bucket: this.#bucketName }));
    } catch {
      throw new BucketMissingError(this.#bucketName);
    }
  }

  /**
   * Get an object from the bucket.
   * @param key The object key
   * @returns The object data as a Buffer and its content type
   */
  async getObject(key: string): Promise<{ data: Buffer; contentType: string }> {
    await this.ensureBucket();
    const resp = await this.#s3.send(
      new GetObjectCommand({
        Bucket: this.#bucketName,
        Key: key,
      }),
    );

    const contentType = resp.ContentType || "application/octet-stream";

    if (!resp.Body) {
      return { data: Buffer.alloc(0), contentType };
    }

    const stream = resp.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return {
      data: Buffer.concat(chunks),
      contentType,
    };
  }

  /**
   * Get the underlying S3 client for advanced operations.
   */
  getS3Client(): S3Client {
    return this.#s3;
  }

  /**
   * Get the bucket name.
   */
  getBucketName(): string {
    return this.#bucketName;
  }
}
