import type { Request, Response } from "express";
import { GalleryController } from "../controllers/gallery.ts";
import { appLogger } from "../middleware/logger.ts";
import { BucketService } from "../services/bucket.ts";
import { normalizeGalleryFolderName } from "../utils.ts";
const bucketService = await BucketService.create();
const galleryController = new GalleryController();

export const streamMedia = async (req: Request, res: Response) => {
  const { galleryName, year, month, day, splat } = req.params;
  const objectName = `${year}-${month}-${day}/${splat}`;
  const { guildId } = req.query;

  appLogger.debug(
    { galleryName, objectName, guildId, path: req.path, originalUrl: req.originalUrl },
    "[streamMedia] Request received",
  );

  if (!galleryName) {
    appLogger.warn({ galleryName }, "[streamMedia] Missing galleryName parameter");
    return res.status(400).json({ error: "Missing galleryName parameter" });
  }

  if (!objectName) {
    appLogger.warn({ objectName }, "[streamMedia] Missing objectName parameter");
    return res.status(400).json({ error: "Missing objectName parameter" });
  }

  if (!guildId) {
    appLogger.warn({ guildId }, "[streamMedia] Missing guildId parameter");
    return res.status(400).json({ error: "Missing guildId parameter" });
  }

  // Validate guild membership from authenticated session
  const guildIds = req.session.guildIds;
  if (!guildIds || guildIds.length === 0) {
    appLogger.warn(
      { userId: req.session.userId, guildId, path: req.path },
      "[streamMedia] Guild access denied: Missing guild membership context",
    );
    return res.status(403).json({ error: "Forbidden: Missing guild membership context" });
  }

  if (!guildIds.includes(guildId as string)) {
    appLogger.warn(
      { userId: req.session.userId, requestedGuildId: guildId, path: req.path },
      "[streamMedia] Guild access denied: Not a member of the requested guild",
    );
    return res.status(403).json({ error: "Forbidden: Not a member of the requested guild" });
  }

  try {
    appLogger.debug({ galleryName, guildId }, "[streamMedia] Resolving gallery folder name");
    // Find the correct gallery by comparing the normalized folder name
    const galleries = await galleryController.listGalleries(guildId as string);
    const foundGallery = galleries.find((g) => normalizeGalleryFolderName(g.name) === galleryName);

    if (!foundGallery) {
      appLogger.warn(
        { galleryName },
        "[streamMedia] Gallery not found after checking all galleries for guild",
      );
      return res.status(404).json({ error: "Gallery not found" });
    }

    // Get the normalized folder name from the gallery
    const folderName = await galleryController.getGalleryFolderName(
      guildId as string,
      foundGallery.name,
    );
    appLogger.debug({ galleryName, folderName }, "[streamMedia] Gallery folder name resolved");

    const candidateKeys = [`${folderName}/uploads/${objectName}`, `${folderName}/${objectName}`];
    appLogger.debug(
      { candidateKeys, folderName, objectName },
      "[streamMedia] Prepared candidate S3 keys",
    );

    let resolvedKey: string | undefined;
    let mediaData: Buffer | undefined;
    let contentType: string | undefined;
    let lastError: unknown;

    for (const candidate of candidateKeys) {
      try {
        appLogger.debug({ candidate }, "[streamMedia] Attempting to fetch object");
        const result = await bucketService.getObject(candidate);
        resolvedKey = candidate;
        mediaData = result.data;
        contentType = result.contentType;
        appLogger.debug({ candidate }, "[streamMedia] Object fetched from bucket");
        break;
      } catch (candidateError) {
        if ((candidateError as Error)?.name === "NoSuchKey") {
          lastError = candidateError;
          appLogger.debug({ candidate }, "[streamMedia] Candidate key missing, trying next");
          continue;
        }
        throw candidateError;
      }
    }

    if (!resolvedKey || !mediaData || !contentType) {
      throw (
        (lastError as Error) ?? Object.assign(new Error("Key not found"), { name: "NoSuchKey" })
      );
    }

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    appLogger.debug(
      { key: resolvedKey, contentType, size: mediaData.length },
      "[streamMedia] Sending binary image response",
    );
    res.send(mediaData);
  } catch (error) {
    const errorMessage = (error as Error)?.message || "Unknown error";
    const errorName = (error as Error)?.name || "UnknownError";

    appLogger.error(
      {
        error,
        errorName,
        errorMessage,
        galleryName,
        objectName,
        guildId,
        path: req.path,
      },
      "[streamMedia] Error serving media",
    );

    if ((error as Error)?.name === "InvalidInputError") {
      return res.status(400).json({ error: (error as Error).message });
    }
    if ((error as Error)?.name === "NoSuchKey") {
      return res.status(404).json({ error: "Image not found" });
    }
    res.status(500).json({ error: "Failed to retrieve media" });
  }
};
