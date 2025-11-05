import type { Request, Response } from "express";

const galleryController = await import("../controllers/index.ts").then(
  (m) => new m.GalleryController(),
);

export const createGallery = async (req: Request, res: Response) => {
  try {
    const name = String(req.body?.name || "");
    await galleryController.createGallery(name);
    res.status(201).json({ name });
  } catch (err: unknown) {
    if ((err as Error)?.name === "InvalidInputError") {
      return res.status(400).json({ error: (err as Error).message });
    }
    if ((err as Error)?.name === "Error" && /already exists/i.test((err as Error).message)) {
      return res.status(409).json({ error: (err as Error).message });
    }
    console.error("[createGallery] error:", err);
    res.status(500).json({ error: "Failed to create gallery" });
  }
};

export const uploadToGallery = async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "Missing 'file' form field" });

  const bucket = req.query.bucket as string;
  if (!bucket) return res.status(400).json({ error: "Missing bucket (query param ?bucket=...)" });

  // Optional: validate bucket name against S3/MinIO naming rules to avoid weird inputs
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) {
    return res.status(400).json({ error: "Invalid bucket name" });
  }

  const prefix = (req.query.prefix as string) || "uploads";
  const nowPrefix = `${prefix}/${new Date().toISOString().slice(0, 10)}`; // e.g., uploads/2025-11-05

  try {
    const uploaded = await galleryController.uploadToGallery(file, bucket, nowPrefix);
    res.status(201).json(uploaded);
  } catch (err: unknown) {
    const hasName = (e: unknown): e is { name?: string; message?: string } =>
      typeof e === "object" && e !== null && ("name" in e || "message" in e);

    if (
      hasName(err) &&
      (err.name === "UnsupportedMimeTypeError" || err.name === "InvalidInputError")
    ) {
      return res.status(400).json({ error: err.message ?? err.name });
    }
    if (hasName(err) && err.name === "BucketMissingError") {
      return res.status(404).json({ error: "Bucket does not exist" });
    }
    console.error("[upload] error:", err);
    return res.status(500).json({ error: "Upload failed" });
  }
};
