import { Router } from "express";
import multer from "multer";
import { discordCallback, GalleryAPI } from "./api/index.ts";

const router = Router();

router.get("/checkhealth", (_req, res) => {
  res.json({ status: "ok" });
});
router.get("/auth/discord", discordCallback);

const galleryAPI = new GalleryAPI();
const upload = multer({
  storage: multer.memoryStorage(), // keep uploads in memory; we stream to MinIO immediately
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB; tune as needed
  },
});
router.post("/gallery", galleryAPI.createGallery);
router.post("/gallery/upload", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "Missing 'file' form field" });

  const bucket = req.query.bucket as string;
  if (!bucket) return res.status(400).json({ error: "Missing bucket (query param ?bucket=...)" });

  const prefix = (req.query.prefix as string) || "uploads";
  const nowPrefix = `${prefix}/${new Date().toISOString().slice(0, 10)}`; // e.g., uploads/2025-11-05

  try {
    const uploaded = await galleryAPI.uploadToGallery(file, bucket, nowPrefix);
    res.status(201).json(uploaded);
  } catch (err: unknown) {
    const hasName = (e: unknown): e is { name?: string; message?: string } =>
      typeof e === "object" && e !== null && ("name" in e || "message" in e);

    if (hasName(err) && err.name === "UnsupportedMimeTypeError") {
      return res.status(400).json({ error: err.message ?? err.name });
    }
    if (hasName(err) && err.name === "BucketMissingError") {
      return res.status(404).json({ error: "Bucket does not exist" });
    }
    console.error("[upload] error:", err);
    return res.status(500).json({ error: "Upload failed" });
  }
});

export default router;
