import type { Request, Response } from "express";
import {
  createGallerySchema,
  removeGallerySchema,
  setDefaultGallerySchema,
  updateGalleryNameSchema,
} from "utils";
import z from "zod";
import { appLogger } from "../middleware/logger.ts";

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

  const guildId = String(req.query.guildId || "");
  if (!guildId) {
    return res.status(400).json({ error: "Missing guildId parameter" });
  }

  try {
    const items = await galleryController.getGalleryContents(guildId, galleryName);
    appLogger.debug(
      { guildId, galleryName, count: items.count },
      "[listGalleryItems] Retrieved gallery contents",
    );
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

export const updateGalleryName = async (req: Request, res: Response) => {
  try {
    const body = updateGalleryNameSchema.parse(req.body);

    if (body.galleryName === body.newGalleryName) {
      return res.status(400).json({ error: "New gallery name is the same as current name" });
    }

    await galleryController.renameGallery(body.guildId, body.galleryName, body.newGalleryName);

    res.json({ oldName: body.galleryName, newName: body.newGalleryName });
  } catch (err: unknown) {
    if ((err as Error)?.name === "InvalidInputError") {
      return res.status(400).json({ error: (err as Error).message });
    }
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.issues.map((e) => e.message).join(", ") });
    }
    appLogger.error({ err }, "[updateGalleryName] error");
    res.status(500).json({ error: "Failed to update gallery name" });
  }
};

export const getImage = async (req: Request, res: Response) => {
  const galleryName = req.params.galleryName;
  const rawImagePath = req.params.imagePath;
  const imagePath = Array.isArray(rawImagePath) ? rawImagePath.join("/") : rawImagePath;
  const guildId = String(req.query.guildId || "");

  if (!galleryName) {
    return res.status(400).json({ error: "Missing galleryName parameter" });
  }

  if (!imagePath) {
    return res.status(400).json({ error: "Missing imagePath parameter" });
  }

  if (!guildId) {
    return res.status(400).json({ error: "Missing guildId parameter" });
  }

  try {
    const { data, contentType } = await galleryController.getImage(guildId, galleryName, imagePath);

    // Set cache headers for CDN support
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.send(data);
  } catch (err: unknown) {
    if ((err as Error)?.name === "InvalidInputError") {
      return res.status(400).json({ error: (err as Error).message });
    }
    if ((err as Error)?.name === "NoSuchKey") {
      return res.status(404).json({ error: "Image not found" });
    }
    appLogger.error({ err, galleryName, imagePath }, "[getImage] error");
    res.status(500).json({ error: "Failed to retrieve image" });
  }
};
