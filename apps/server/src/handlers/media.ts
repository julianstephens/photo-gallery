import type { Request, Response } from "express";
import { GalleryController } from "../controllers/gallery.ts";
import { appLogger } from "../middleware/logger.ts";
import { BucketService } from "../services/bucket.ts";
import { normalizeGalleryFolderName } from "../utils.ts";
const bucketService = await BucketService.create();
const galleryController = new GalleryController();

type AwsLikeError = Error & { $metadata?: { httpStatusCode?: number }; code?: string };

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

  if (!guildId || typeof guildId !== "string") {
    appLogger.warn(
      { galleryName, guildId, path: req.path },
      "[streamMedia] Missing guildId query parameter",
    );
    return res.status(400).json({ error: "Missing guildId parameter" });
  }

  try {
    appLogger.debug({ galleryName, guildId }, "[streamMedia] Resolving gallery folder name");
    // Find the correct gallery by comparing the normalized folder name
    const galleries = await galleryController.listGalleries(guildId);
    const foundGallery = galleries.find((g) => normalizeGalleryFolderName(g.name) === galleryName);

    if (!foundGallery) {
      appLogger.warn(
        { galleryName },
        "[streamMedia] Gallery not found after checking all galleries for guild",
      );
      return res.status(404).json({ error: "Gallery not found" });
    }

    // Get the normalized folder name from the gallery
    const folderName = await galleryController.getGalleryFolderName(guildId, foundGallery.name);
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
        const err = candidateError as AwsLikeError;
        const statusCode = err?.$metadata?.httpStatusCode;
        const isMissing = err?.name === "NoSuchKey" || statusCode === 404;
        if (isMissing) {
          lastError = err;
          appLogger.debug({ candidate }, "[streamMedia] Candidate key missing, trying next");
          continue;
        }

        appLogger.error(
          { candidate, statusCode, errorName: err?.name, errorMessage: err?.message },
          "[streamMedia] Failed to fetch object from bucket",
        );
        throw err;
      }
    }

    if (!resolvedKey || !mediaData || !contentType) {
      appLogger.error(
        {
          galleryName,
          objectName,
          candidateKeys,
          lastErrorName: (lastError as Error | undefined)?.name,
          lastErrorMessage: (lastError as Error | undefined)?.message,
        },
        "[streamMedia] Exhausted candidate keys without locating object",
      );
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
    const err = error as AwsLikeError;
    const errorMessage = err?.message || "Unknown error";
    const errorName = err?.name || "UnknownError";
    const statusCode = err?.$metadata?.httpStatusCode;

    appLogger.error(
      {
        error: err,
        errorName,
        errorMessage,
        statusCode,
        galleryName,
        objectName,
        guildId,
        path: req.path,
      },
      "[streamMedia] Error serving media",
    );

    if (errorName === "InvalidInputError") {
      return res.status(400).json({ error: errorMessage });
    }
    if (errorName === "NoSuchKey" || statusCode === 404) {
      return res.status(404).json({ error: "Image not found" });
    }
    res.status(500).json({ error: "Failed to retrieve media" });
  }
};
