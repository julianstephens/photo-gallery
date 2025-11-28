/**
 * Backfill script to enqueue gradient generation jobs for existing images.
 *
 * Usage:
 *   pnpm dlx tsx scripts/backfillGradients.ts <guildId> <galleryName> [--dry-run]
 *
 * Options:
 *   --dry-run  Print what would be done without actually enqueueing jobs
 *
 * Requirements:
 *   - GRADIENT_WORKER_ENABLED must be true in environment
 *   - Redis connection must be available
 */
import "dotenv/config";
import { GalleryController } from "../src/controllers/gallery.ts";
import { GradientMetaService } from "../src/services/gradientMeta.ts";
import { enqueueGradientJob } from "../src/workers/index.ts";

const guildId = process.argv[2];
const galleryName = process.argv[3];
const dryRun = process.argv.includes("--dry-run");

if (!guildId || !galleryName) {
  console.error(
    "Usage: pnpm dlx tsx scripts/backfillGradients.ts <guildId> <galleryName> [--dry-run]",
  );
  process.exit(1);
}

async function main() {
  const controller = new GalleryController();
  const gradientMetaService = new GradientMetaService();

  console.log(`Fetching gallery contents for guildId=${guildId}, galleryName=${galleryName}`);

  const result = await controller.getGalleryContents(guildId, galleryName);
  console.log(`Found ${result.count} items in gallery "${result.gallery}"`);

  if (result.count === 0) {
    console.log("No items to process.");
    process.exit(0);
  }

  let enqueuedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const item of result.contents) {
    try {
      // Check if gradient already exists
      const existingGradient = await gradientMetaService.getGradient(item.url);
      if (existingGradient) {
        console.log(`[SKIP] ${item.name} - gradient status: ${existingGradient.status}`);
        skippedCount++;
        continue;
      }

      if (dryRun) {
        console.log(`[DRY-RUN] Would enqueue: ${item.name} (${item.url})`);
        enqueuedCount++;
      } else {
        const jobId = await enqueueGradientJob({
          guildId,
          galleryName,
          storageKey: item.url,
          itemId: item.url.replace(/\//g, "-"),
        });

        if (jobId) {
          console.log(`[ENQUEUED] ${item.name} -> jobId: ${jobId}`);
          enqueuedCount++;
        } else {
          console.log(`[SKIP] ${item.name} - worker disabled or validation failed`);
          skippedCount++;
        }
      }
    } catch (err) {
      console.error(`[ERROR] ${item.name}:`, err);
      errorCount++;
    }
  }

  console.log("\n=== Summary ===");
  console.log(`Enqueued: ${enqueuedCount}`);
  console.log(`Skipped:  ${skippedCount}`);
  console.log(`Errors:   ${errorCount}`);
  console.log(`Total:    ${result.count}`);

  if (dryRun) {
    console.log("\n(This was a dry run. No jobs were actually enqueued.)");
  }

  process.exit(errorCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
