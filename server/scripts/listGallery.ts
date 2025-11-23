import "dotenv/config";
import { GalleryController } from "../src/controllers/gallery.ts";

const guildId = process.argv[2];
const galleryName = process.argv[3];

if (!guildId || !galleryName) {
  console.error("Usage: pnpm dlx tsx scripts/listGallery.ts <guildId> <galleryName>");
  process.exit(1);
}

const controller = new GalleryController();

controller
  .getGalleryContents(guildId, galleryName)
  .then((result) => {
    const summary = {
      count: result.count,
      names: result.contents.map((item) => item.name),
    };
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
