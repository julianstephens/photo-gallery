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
  type HeadObjectCommandOutput,
  type ListObjectsV2CommandOutput,
  type PutObjectCommandInput,
  type _Object as S3Object,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createReadStream, statSync } from "fs";
import type { Readable } from "stream";
import type { FileChecksum, GalleryItem } from "utils";
import { appLogger } from "../middleware/logger.ts";
import env from "../schemas/env.ts";

class BucketMissingError extends Error {
  constructor() {
    super("Bucket does not exist");
    this.name = "BucketMissingError";
  }
}

export class BucketService {
  #s3: S3Client;
  #bucketName: string;

  constructor() {
    this.#s3 = new S3Client({
      endpoint: env.S3_ENDPOINT,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY,
        secretAccessKey: env.S3_SECRET_KEY,
      },
      region: "garage",
      forcePathStyle: true,
    });
    this.#bucketName = env.MASTER_BUCKET_NAME;
  }

  static async create() {
    const service = new BucketService();
    try {
      await service.ensureBucket();
    } catch {
      throw new Error(`Master bucket "${service.#bucketName}" is missing or inaccessible`);
    }
    return service;
  }

  private async ensureBucket() {
    try {
      await this.#s3.send(new HeadBucketCommand({ Bucket: this.#bucketName }));
    } catch {
      throw new BucketMissingError();
    }
  }

  // Sanitize a path segment (no leading/trailing slashes)
  #sanitize = (segment: string) => segment.replace(/^\/+|\/+$/g, "");

  // Build a key under the master bucket for a given gallery name and optional object name
  #buildKey = (name: string, objectName?: string) => {
    const base = this.#sanitize(name);
    if (!objectName) return `${base}/`;
    return `${base}/${this.#sanitize(objectName)}`;
  };

  async #getObjectMetadata(key: string): Promise<Record<string, string>> {
    try {
      const resp = await this.#s3.send(
        new HeadObjectCommand({
          Bucket: this.#bucketName,
          Key: key,
        }),
      );
      return resp.Metadata ?? {};
    } catch {
      // If HEAD fails (permission denied, not found, etc.), silently return empty metadata
      // This is expected behavior - metadata is optional for displaying gallery items
      return {};
    }
  }

  async getObjectChecksums(key: string) {
    try {
      await this.ensureBucket();
      const resp: HeadObjectCommandOutput = await this.#s3.send(
        new HeadObjectCommand({
          Bucket: this.#bucketName,
          Key: key,
          ChecksumMode: "ENABLED",
        }),
      );
      return {
        ChecksumCRC32: resp.ChecksumCRC32,
        ChecksumCRC32C: resp.ChecksumCRC32C,
        ChecksumCRC64NVME: resp.ChecksumCRC64NVME,
        ChecksumSHA1: resp.ChecksumSHA1,
        ChecksumSHA256: resp.ChecksumSHA256,
      };
    } catch (err) {
      appLogger.warn(
        { err, key },
        "Failed to get object checksums (object may not exist or S3 does not support checksums)",
      );
      return {
        ChecksumCRC32: undefined,
        ChecksumCRC32C: undefined,
        ChecksumCRC64NVME: undefined,
        ChecksumSHA1: undefined,
        ChecksumSHA256: undefined,
      };
    }
  }

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

  // List all objects under a prefix, handling pagination via ContinuationToken
  async #listAllFolderObjects(prefix: string) {
    const all: S3Object[] = [];
    let token: string | undefined = undefined;
    while (true) {
      const resp: ListObjectsV2CommandOutput = await this.#s3.send(
        new ListObjectsV2Command({
          Bucket: this.#bucketName,
          Prefix: prefix,
          MaxKeys: 1000,
          ContinuationToken: token,
        }),
      );
      const contents = resp?.Contents ?? [];
      all.push(...contents);
      const isTruncated = Boolean(resp.IsTruncated);
      token = resp.NextContinuationToken ?? undefined;
      if (!isTruncated || !token) break;
    }
    return all;
  }

  createBucketFolder = async (name: string) => {
    // Create a folder marker for this gallery prefix (zero-byte object ending with '/')
    const key = this.#buildKey(name);
    await this.#s3.send(
      new PutObjectCommand({
        Bucket: this.#bucketName,
        Key: key,
        Body: new Uint8Array(0),
        ContentLength: 0,
      }),
    );
  };

  createPresignedUrl = async (key: string): Promise<string> => {
    const url = await getSignedUrl(
      // @ts-expect-error getSignedUrl accepts S3Client despite generic constraints
      this.#s3,
      new GetObjectCommand({
        Bucket: this.#bucketName,
        Key: key,
        ResponseContentDisposition: "inline",
      }),
      { expiresIn: 3600 },
    );
    return url.replace(/^http:/, "https:");
  };

  getBucketFolderContents = async (
    name: string,
    recursive?: boolean,
  ): Promise<Array<GalleryItem>> => {
    if (recursive === undefined) recursive = true;
    await this.ensureBucket();
    const prefix = this.#buildKey(name);
    const contents = await this.#listAllFolderObjects(prefix);
    const items = await Promise.all(
      contents.map(async (o: S3Object) => {
        const key = o.Key ?? "";
        const type = key.endsWith("/") ? "folder" : "file";
        if (!recursive && type === "folder" && key !== prefix) {
          return null;
        }
        const relative = key.startsWith(prefix) ? key.slice(prefix.length) : key;
        return {
          name: relative,
          size: o.Size,
          url: key,
          metadata: await this.#getObjectMetadata(key),
        };
      }),
    );
    return items.filter((item): item is GalleryItem => item !== null);
  };

  uploadToBucket = async (
    bucketName: string,
    objectName: string,
    filePath: string,
    options?: {
      meta?: Record<string, string>;
      checksums?: FileChecksum;
    },
  ) => {
    await this.ensureBucket();
    const meta = options?.meta;
    const { ["Content-Type"]: contentType, ...metadata } = meta ?? {};
    const key = this.#buildKey(bucketName, objectName);
    const { size } = statSync(filePath);
    const putParams: PutObjectCommandInput = {
      Bucket: this.#bucketName,
      Key: key,
      Body: createReadStream(filePath),
      ContentLength: size,
      ContentType: contentType,
      Metadata: Object.keys(metadata).length ? metadata : undefined,
    };

    if (options?.checksums?.crc32Base64) {
      putParams.ChecksumCRC32 = options.checksums.crc32Base64;
    }
    if (options?.checksums?.md5Base64) {
      putParams.ContentMD5 = options.checksums.md5Base64;
    }

    try {
      await this.#s3.send(new PutObjectCommand(putParams));
    } catch (err) {
      appLogger.error(
        { err, masterBucket: this.#bucketName, galleryName: bucketName, objectName, filePath, key },
        "[bucketService] uploadToBucket failed",
      );
      throw err;
    }
  };

  uploadBufferToBucket = async (
    galleryName: string,
    objectName: string,
    buffer: Buffer,
    meta?: Record<string, string>,
  ) => {
    await this.ensureBucket();
    const { ["Content-Type"]: contentType, ...metadata } = meta ?? {};
    const key = this.#buildKey(galleryName, objectName);
    const putObjectData: PutObjectCommandInput = {
      Bucket: this.#bucketName,
      Key: key,
      Body: buffer,
      ContentLength: buffer.length,
      ContentType: contentType,
      Metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    };
    try {
      await this.#s3.send(new PutObjectCommand(putObjectData));
    } catch (err) {
      appLogger.error(
        { err, masterBucket: this.#bucketName, galleryName, objectName, size: buffer.length, key },
        "[bucketService] uploadBufferToBucket failed",
      );
      throw err;
    }
  };

  uploadStreamToBucket = async (
    galleryName: string,
    objectName: string,
    stream: Readable,
    size?: number,
    meta?: Record<string, string>,
  ) => {
    await this.ensureBucket();
    const { ["Content-Type"]: contentType, ...metadata } = meta ?? {};
    const key = this.#buildKey(galleryName, objectName);
    try {
      await this.#s3.send(
        new PutObjectCommand({
          Bucket: this.#bucketName,
          Key: key,
          Body: stream,
          // ContentLength: typeof size === "number" ? size : undefined,
          ContentType: contentType,
          Metadata: Object.keys(metadata).length ? metadata : undefined,
        }),
      );
    } catch (err) {
      appLogger.error(
        { err, masterBucket: this.#bucketName, galleryName, objectName, size, key },
        "[bucketService] uploadStreamToBucket failed",
      );
      throw err;
    }
  };

  deleteObjectFromBucket = async (galleryName: string, objectName: string) => {
    await this.ensureBucket();
    await this.#s3.send(
      new DeleteObjectCommand({
        Bucket: this.#bucketName,
        Key: this.#buildKey(galleryName, objectName),
      }),
    );
  };

  deleteBucketFolder = async (name: string) => {
    await this.ensureBucket();
    const key = this.#buildKey(name);
    await this.#s3.send(new DeleteObjectCommand({ Bucket: this.#bucketName, Key: key }));
  };

  emptyBucketFolder = async (name: string) => {
    // Delete all objects under the gallery prefix within the master bucket
    await this.ensureBucket();
    const prefix = this.#buildKey(name);
    const contents = await this.#listAllFolderObjects(prefix);
    if (contents.length > 0) {
      const keys = contents
        .map((o) => o.Key)
        .filter((k): k is string => typeof k === "string" && k.length > 0)
        .map((Key) => ({ Key }));
      // Delete in batches of 1000
      const BATCH = 1000;
      for (let i = 0; i < keys.length; i += BATCH) {
        const batch = keys.slice(i, i + BATCH);
        await this.#s3.send(
          new DeleteObjectsCommand({ Bucket: this.#bucketName, Delete: { Objects: batch } }),
        );
      }
    }
    // Always attempt to remove the folder marker (idempotent if missing)
    await this.#s3.send(new DeleteObjectCommand({ Bucket: this.#bucketName, Key: prefix }));
  };

  renameBucketFolder = async (oldName: string, newName: string) => {
    await this.ensureBucket();
    const oldPrefix = this.#buildKey(oldName);
    const newPrefix = this.#buildKey(newName);
    const contents = await this.#listAllFolderObjects(oldPrefix);
    for (const obj of contents) {
      const oldKey = obj.Key ?? "";
      if (!oldKey) continue; // skip if key is missing
      const relative = oldKey.startsWith(oldPrefix) ? oldKey.slice(oldPrefix.length) : oldKey;
      const newKey = `${newPrefix}${relative}`;
      // Copy object to new key
      await this.#s3.send(
        new CopyObjectCommand({
          Bucket: this.#bucketName,
          Key: newKey,
          CopySource: encodeURIComponent(`${this.#bucketName}/${oldKey}`),
        }),
      );
    }
    // Delete old objects in batches of 1000
    if (contents.length > 0) {
      const keys = contents
        .map((o) => o.Key)
        .filter((k): k is string => typeof k === "string" && k.length > 0)
        .map((Key) => ({ Key }));
      const BATCH = 1000;
      for (let i = 0; i < keys.length; i += BATCH) {
        const batch = keys.slice(i, i + BATCH);
        await this.#s3.send(
          new DeleteObjectsCommand({ Bucket: this.#bucketName, Delete: { Objects: batch } }),
        );
      }
    }
  };
}
