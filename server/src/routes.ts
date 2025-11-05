import { Router } from "express";
import multer from "multer";
import * as handlers from "./handlers/index.ts";

const router = Router();

router.get("/checkhealth", (_req, res) => {
  res.json({ status: "ok" });
});
router.get("/auth/discord", handlers.discordCallback);

const upload = multer({
  storage: multer.memoryStorage(), // keep uploads in memory; we stream to MinIO immediately
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB; tune as needed
  },
});
router.post("/gallery", handlers.createGallery);
router.post("/gallery/upload", upload.single("file"), handlers.uploadToGallery);

export default router;
