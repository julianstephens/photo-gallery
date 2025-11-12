import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type ListObjectsV2CommandOutput,
  type _Object as S3Object,
} from "@aws-sdk/client-s3";
import { createReadStream } from "fs";
import type { Readable } from "stream";
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

  getBucketFolderContents = async (name: string) => {
    await this.ensureBucket();
    const prefix = this.#buildKey(name);
    const contents = await this.#listAllFolderObjects(prefix);
    const items = contents.map((o: S3Object) => {
      const key = o.Key ?? "";
      const relative = key.startsWith(prefix) ? key.slice(prefix.length) : key;
      return { name: relative, size: o.Size };
    });
    return items;
  };

  uploadToBucket = async (
    bucketName: string,
    objectName: string,
    filePath: string,
    meta?: Record<string, string>,
  ) => {
    await this.ensureBucket();
    const { ["Content-Type"]: contentType, ...metadata } = meta ?? {};
    await this.#s3.send(
      new PutObjectCommand({
        Bucket: this.#bucketName,
        Key: this.#buildKey(bucketName, objectName),
        Body: createReadStream(filePath),
        ContentType: contentType,
        Metadata: Object.keys(metadata).length ? metadata : undefined,
      }),
    );
  };

  uploadBufferToBucket = async (
    bucketName: string,
    objectName: string,
    buffer: Buffer,
    meta?: Record<string, string>,
  ) => {
    await this.ensureBucket();
    const { ["Content-Type"]: contentType, ...metadata } = meta ?? {};
    await this.#s3.send(
      new PutObjectCommand({
        Bucket: this.#bucketName,
        Key: this.#buildKey(bucketName, objectName),
        Body: buffer,
        ContentLength: buffer.length,
        ContentType: contentType,
        Metadata: Object.keys(metadata).length ? metadata : undefined,
      }),
    );
  };

  uploadStreamToBucket = async (
    bucketName: string,
    objectName: string,
    stream: Readable,
    size?: number,
    meta?: Record<string, string>,
  ) => {
    await this.ensureBucket();
    const { ["Content-Type"]: contentType, ...metadata } = meta ?? {};
    await this.#s3.send(
      new PutObjectCommand({
        Bucket: this.#bucketName,
        Key: this.#buildKey(bucketName, objectName),
        Body: stream,
        ContentLength: typeof size === "number" ? size : undefined,
        ContentType: contentType,
        Metadata: Object.keys(metadata).length ? metadata : undefined,
      }),
    );
  };

  deleteObjectFromBucket = async (bucketName: string, objectName: string) => {
    await this.ensureBucket();
    await this.#s3.send(
      new DeleteObjectCommand({
        Bucket: this.#bucketName,
        Key: this.#buildKey(bucketName, objectName),
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
