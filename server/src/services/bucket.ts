import * as Minio from "minio";
import env from "../schemas/env.ts";

class BucketMissingError extends Error {
  constructor() {
    super("Bucket does not exist");
    this.name = "BucketMissingError";
  }
}

export class BucketService {
  _minio: Minio.Client;

  constructor() {
    this._minio = new Minio.Client({
      endPoint: env.MINIO_ENDPOINT,
      port: env.MINIO_PORT,
      useSSL: true,
      accessKey: env.MINIO_ACCESS_KEY,
      secretKey: env.MINIO_SECRET_KEY,
    });
  }

  private async ensureBucket(name: string) {
    const exists = await this._minio.bucketExists(name);
    if (!exists) throw BucketMissingError;
  }

  createBucket = async (name: string) => {
    await this.ensureBucket(name);
    await this._minio.makeBucket(name);
  };

  getBucketContents = async (name: string) => {
    await this.ensureBucket(name);

    return await new Promise<Minio.BucketItem[]>((resolve, reject) => {
      const contents: Minio.BucketItem[] = [];
      const stream = this._minio.listObjectsV2(name, "", true);
      stream.on("data", (obj) => contents.push(obj));
      stream.on("error", (err) => reject(err));
      stream.on("end", () => resolve(contents));
    });
  };

  uploadToBucket = async (
    bucketName: string,
    objectName: string,
    filePath: string,
    meta?: Minio.ItemBucketMetadata,
  ) => {
    await this.ensureBucket(bucketName);
    await this._minio.fPutObject(bucketName, objectName, filePath, meta);
  };

  uploadBufferToBucket = async (
    bucketName: string,
    objectName: string,
    buffer: Buffer,
    meta?: Record<string, string>,
  ) => {
    await this.ensureBucket(bucketName);
    await this._minio.putObject(bucketName, objectName, buffer, buffer.length, meta);
  };

  uploadStreamToBucket = async (
    bucketName: string,
    objectName: string,
    stream: NodeJS.ReadableStream,
    size?: number,
    meta?: Record<string, string>,
  ) => {
    await this.ensureBucket(bucketName);
    // MinIO SDK prefers a size; if not known, omit it and the SDK will use chunked transfer.
    if (typeof size === "number") {
      // @ts-expect-error: size optional for streaming/chunked
      await this._minio.putObject(bucketName, objectName, stream, size, meta);
    } else {
      // @ts-expect-error: size optional for streaming/chunked
      await this._minio.putObject(bucketName, objectName, stream, meta);
    }
  };

  deleteObjectFromBucket = async (bucketName: string, objectName: string) => {
    await this.ensureBucket(bucketName);
    await this._minio.removeObject(bucketName, objectName);
  };

  deleteBucket = async (name: string) => {
    await this.ensureBucket(name);
    await this._minio.removeBucket(name);
  };

  emptyBucket = async (name: string) => {
    await this.ensureBucket(name);
    const objects = await this.getBucketContents(name);
    if (objects.length === 0) return;
    const objectNames = objects
      .map((obj) => obj.name)
      .filter((n): n is string => typeof n === "string" && n.length > 0);
    await this._minio.removeObjects(name, objectNames);
  };
}
