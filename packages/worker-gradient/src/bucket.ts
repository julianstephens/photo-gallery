import { BucketService } from "utils/bucket";
import type { Env } from "./env.js";

// Re-export BucketService and BucketMissingError for convenience
export { BucketService, BucketMissingError } from "utils/bucket";

/**
 * Create a BucketService configured for the gradient worker environment.
 */
export function createBucketService(env: Env): BucketService {
  return new BucketService({
    endpoint: env.S3_ENDPOINT,
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
    bucketName: env.MASTER_BUCKET_NAME,
  });
}
