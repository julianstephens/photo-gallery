import "dotenv/config";
import { GalleryController } from "../src/controllers/gallery.ts";

const galleryName = process.argv[2];

if (!galleryName) {
  console.error("Usage: pnpm tsx scripts/listGallery.ts <galleryName>");
  process.exit(1);
}

const controller = new GalleryController();

controller
  .getGalleryContents(galleryName)
  .then((result) => {
    const summary = {
      count: result.count,
      names: result.contents.map((item) => item.name),
    };
    console.log(JSON.stringify(summary, null, 2));
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
