import "dotenv/config";
import { BucketService } from "../src/services/bucket.ts";

const [galleryName, objectName] = process.argv.slice(2);

if (!galleryName || !objectName) {
  console.error("Usage: pnpm dlx tsx scripts/deleteGalleryObject.ts <galleryName> <objectName>");
  process.exit(1);
}

async function main() {
  const bucket = new BucketService();
  await bucket.deleteObjectFromBucket(galleryName, objectName);
  console.log(`Deleted ${objectName} from gallery ${galleryName}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
