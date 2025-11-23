import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
  type _Object as S3Object,
} from "@aws-sdk/client-s3";
import "dotenv/config";
import env from "../src/schemas/env.ts";

const prefixArg = process.argv[2];

const client = new S3Client({
  endpoint: env.S3_ENDPOINT,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
  region: "garage",
  forcePathStyle: true,
});

const isAppleDouble = (key: string | undefined | null) => {
  if (!key) return false;
  const segments = key.split("/");
  const filename = segments[segments.length - 1] ?? "";
  if (segments.includes("__MACOSX")) return true;
  if (filename.startsWith("._")) return true;
  const stripped = filename.replace(/^\d+-\d+-/, "");
  return stripped.startsWith("._");
};

const deleteBatch = async (objects: S3Object[]) => {
  if (!objects.length) return;
  const request = new DeleteObjectsCommand({
    Bucket: env.MASTER_BUCKET_NAME,
    Delete: {
      Objects: objects
        .map((obj) => obj.Key)
        .filter((key): key is string => Boolean(key))
        .map((Key) => ({ Key })),
      Quiet: true,
    },
  });
  await client.send(request);
};

async function main() {
  console.log(
    `Scanning bucket "${env.MASTER_BUCKET_NAME}" for AppleDouble artifacts${prefixArg ? ` under prefix "${prefixArg}"` : ""}...`,
  );

  let token: string | undefined;
  let totalScanned = 0;
  let totalDeleted = 0;

  do {
    const resp = await client.send(
      new ListObjectsV2Command({
        Bucket: env.MASTER_BUCKET_NAME,
        Prefix: prefixArg,
        ContinuationToken: token,
        MaxKeys: 1000,
      }),
    );

    const contents = resp.Contents ?? [];
    totalScanned += contents.length;
    const victims = contents.filter((obj) => isAppleDouble(obj.Key));

    if (victims.length > 0) {
      console.log(`Found ${victims.length} AppleDouble objects in this page; deleting...`);
      for (let i = 0; i < victims.length; i += 1000) {
        const batch = victims.slice(i, i + 1000);
        await deleteBatch(batch);
        totalDeleted += batch.length;
      }
    }

    token = resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (token);

  console.log(
    `Done. Scanned ${totalScanned} objects; deleted ${totalDeleted} AppleDouble entries.`,
  );
}

main().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
