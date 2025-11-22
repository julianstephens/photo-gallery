import type { Request, Response } from "express";
import { createGallerySchema, removeGallerySchema, setDefaultGallerySchema } from "utils";
import z from "zod";

const galleryController = await import("../controllers/index.ts").then(
  (m) => new m.GalleryController(),
);

export const listGalleries = async (req: Request, res: Response) => {
  const guildId = String(req.query.guildId || "");
  if (!guildId) {
    return res.status(400).json({ error: "Missing guildId parameter" });
  }

  try {
    const galleries = await galleryController.listGalleries(guildId);
    res.json(galleries);
  } catch (err: unknown) {
    console.error("[listGalleries] error:", err);
    res.status(500).json({ error: "Failed to list galleries" });
  }
};

export const listGalleryItems = async (req: Request, res: Response) => {
  const galleryName = String(req.query.galleryName || "");
  if (!galleryName) {
    return res.status(400).json({ error: "Missing galleryName parameter" });
  }

  try {
    const items = await galleryController.getGalleryContents(galleryName);
    res.json(items);
  } catch (err: unknown) {
    console.error("[listGalleryItems] error:", err);
    res.status(500).json({ error: "Failed to list gallery items" });
  }
};

export const createGallery = async (req: Request, res: Response) => {
  try {
    const body = createGallerySchema.parse(req.body);
    const meta = await galleryController.createGallery(body, req.session.userId || "");
    res.status(201).json(meta);
  } catch (err: unknown) {
    if ((err as Error)?.name === "InvalidInputError") {
      return res.status(400).json({ error: (err as Error).message });
    }
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.issues.map((e) => e.message).join(", ") });
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

  const galleryName = String(req.body.galleryName || "");
  if (!galleryName) {
    return res.status(400).json({ error: "Missing galleryName parameter" });
  }

  const guildId = String(req.body.guildId || "");
  if (!guildId) {
    return res.status(400).json({ error: "Missing guildId parameter" });
  }

  const objectName = `uploads/${new Date().toISOString().slice(0, 10)}`;

  try {
    const result = await galleryController.uploadToGallery(file, galleryName, guildId, objectName);
    res.status(201).json(result);
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

export const setDefaultGallery = async (req: Request, res: Response) => {
  try {
    const body = setDefaultGallerySchema.parse(req.body);
    const result = await galleryController.setDefaultGallery(body, req.session.userId || "");
    res.status(200).json(result);
  } catch (err: unknown) {
    if ((err as Error)?.name === "InvalidInputError") {
      return res.status(400).json({ error: (err as Error).message });
    }
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.issues.map((e) => e.message).join(", ") });
    }
    console.error("[setDefaultGallery] error:", err);
    res.status(500).json({ error: "Failed to set default gallery" });
  }
};

export const removeGallery = async (req: Request, res: Response) => {
  try {
    const body = removeGallerySchema.parse(req.body);
    await galleryController.removeGallery(body.guildId, body.galleryName);
    res.status(204).send();
  } catch (err: unknown) {
    if ((err as Error)?.name === "InvalidInputError") {
      return res.status(400).json({ error: (err as Error).message });
    }
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.issues.map((e) => e.message).join(", ") });
    }
    console.error("[removeGallery] error:", err);
    res.status(500).json({ error: "Failed to remove gallery" });
  }
};

export const getUploadJob = async (req: Request, res: Response) => {
  const jobId = String(req.params.jobId || "");
  if (!jobId) {
    return res.status(400).json({ error: "Missing jobId parameter" });
  }

  try {
    const job = await galleryController.getUploadJob(jobId);
    res.json(job);
  } catch (err: unknown) {
    if ((err as Error)?.name === "InvalidInputError") {
      return res.status(404).json({ error: (err as Error).message });
    }
    console.error("[getUploadJob] error:", err);
    res.status(500).json({ error: "Failed to get upload job" });
  }
};
