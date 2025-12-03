import { GetObjectCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import type { Readable } from "stream";
import type { Env } from "./env.js";
import type { Logger } from "./logger.js";

class BucketMissingError extends Error {
  constructor() {
    super("Bucket does not exist");
    this.name = "BucketMissingError";
  }
}

/**
 * Minimal bucket service for the gradient worker.
 * Only includes the getObject method needed for gradient generation.
 */
export class BucketService {
  #s3: S3Client;
  #bucketName: string;

  constructor(env: Env, _logger: Logger) {
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

  private async ensureBucket() {
    try {
      await this.#s3.send(new HeadBucketCommand({ Bucket: this.#bucketName }));
    } catch {
      throw new BucketMissingError();
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
}
