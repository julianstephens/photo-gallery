import type { Request, Response } from "express";
import { rm } from "fs/promises";
import {
  finalizeUploadRequestSchema,
  initiateUploadRequestSchema,
  uploadChunkQuerySchema,
} from "utils";
import { ZodError } from "zod";
import { GalleryController } from "../controllers/gallery.ts";
import { appLogger } from "../middleware/logger.ts";
import { BucketService } from "../services/bucket.ts";
import { ChunkedUploadService } from "../services/chunkedUpload.ts";
import { UploadService } from "../services/upload.ts";
import { enqueueGradientJob } from "../workers/index.ts";

const chunkedUploadService = new ChunkedUploadService();
const bucketService = new BucketService();
const uploadService = new UploadService();
const galleryController = new GalleryController();

// Maximum allowed chunk size (10MB) to prevent memory exhaustion
const MAX_CHUNK_SIZE = 10 * 1024 * 1024;
const CHUNK_SIZE_ERROR = `Chunk size exceeds maximum allowed (${MAX_CHUNK_SIZE / (1024 * 1024)}MB)`;

export const initiateUpload = async (req: Request, res: Response) => {
  try {
    const body = initiateUploadRequestSchema.parse(req.body);
    const result = await chunkedUploadService.initiateUpload(body);
    res.status(201).json(result);
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: "Invalid request body" });
    }
    appLogger.error({ err, body: req.body }, "[initiateUpload] error");
    res.status(500).json({ error: "Failed to initiate upload" });
  }
};

export const uploadChunk = async (req: Request, res: Response) => {
  let uploadId: string | undefined;
  let chunkIndex: number | undefined;
  try {
    const query = uploadChunkQuerySchema.parse(req.query);
    const { uploadId: parsedUploadId, index } = query;
    uploadId = parsedUploadId;
    chunkIndex = index;

    // Validate Content-Length header if present
    const contentLength = req.headers["content-length"];
    if (contentLength) {
      const length = parseInt(contentLength, 10);
      if (length > MAX_CHUNK_SIZE) {
        return res.status(413).json({ error: CHUNK_SIZE_ERROR });
      }
    }

    // Get the chunk data from request body (raw buffer) with size limit
    const chunks: Buffer[] = [];
    let totalSize = 0;

    try {
      await new Promise<void>((resolve, reject) => {
        req.on("data", (chunk: Buffer) => {
          totalSize += chunk.length;
          if (totalSize > MAX_CHUNK_SIZE) {
            reject(new Error(CHUNK_SIZE_ERROR));
            return;
          }
          chunks.push(chunk);
        });

        req.on("end", () => {
          resolve();
        });

        req.on("error", (error) => {
          reject(error);
        });
      });
    } catch (error) {
      if ((error as Error).message === CHUNK_SIZE_ERROR) {
        return res.status(413).json({ error: CHUNK_SIZE_ERROR });
      }
      throw error;
    }

    const chunkBuffer = Buffer.concat(chunks);

    if (chunkBuffer.length === 0) {
      return res.status(400).json({ error: "Empty chunk data" });
    }

    await chunkedUploadService.saveChunk(parsedUploadId, index, chunkBuffer);
    res.status(200).json({ success: true, index });
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: "Invalid query parameters" });
    }
    if ((err as Error)?.message?.includes("not found")) {
      return res.status(404).json({ error: "Upload session not found" });
    }
    appLogger.error({ err, uploadId, chunkIndex }, "[uploadChunk] error");
    res.status(500).json({ error: "Failed to upload chunk" });
  }
};

export const finalizeUpload = async (req: Request, res: Response) => {
  let uploadId: string | undefined;
  try {
    const body = finalizeUploadRequestSchema.parse(req.body);
    uploadId = body.uploadId;
    const metadata = chunkedUploadService.getMetadata(uploadId);
    if (!metadata) {
      return res.status(404).json({ error: "Upload session not found" });
    }

    const finalizeResponse = await chunkedUploadService.finalizeUpload(uploadId);
    const finalizedPath = finalizeResponse.filePath;
    const checksums = finalizeResponse.checksums;
    const uploadDatePrefix = `uploads/${new Date().toISOString().split("T")[0]}`;

    // Get the normalized gallery folder name from metadata
    const galleryFolderName = await galleryController.getGalleryFolderName(
      metadata.guildId,
      metadata.galleryName,
    );

    try {
      // Validate that the file is an image based on MIME type
      const validImageTypes = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "image/svg+xml",
        "image/bmp",
        "image/tiff",
        "image/x-icon",
      ];

      if (!validImageTypes.includes(metadata.fileType)) {
        await rm(finalizedPath, { force: true }).catch(() => {});
        chunkedUploadService.markFailed(
          uploadId,
          `Invalid file type: ${metadata.fileType}. Only image files are supported.`,
        );
        return res.status(400).json({
          error: `Invalid file type: ${metadata.fileType}. Only image files are supported.`,
        });
      }

      // Update progress for single file upload
      chunkedUploadService.updateProgress(uploadId, "processing", "server-upload", {
        totalFiles: 1,
        processedFiles: 0,
      });

      const objectName = uploadService.buildObjectName(uploadDatePrefix, metadata.fileName);
      const storageKey = `${galleryFolderName}/${objectName}`;
      appLogger.debug(
        {
          uploadId,
          storageKey,
          fileType: metadata.fileType,
          expectedSize: metadata.totalSize,
          finalizedPath,
          checksums,
        },
        "[finalizeUpload] Uploading assembled file to bucket",
      );
      await bucketService.uploadToBucket(galleryFolderName, objectName, finalizedPath, {
        meta: { "Content-Type": metadata.fileType },
        checksums,
      });
      await rm(finalizedPath, { force: true }).catch(() => {});

      if (checksums) {
        try {
          const remoteChecksum = await bucketService.getObjectChecksums(storageKey);
          const remoteCrc32 = remoteChecksum?.ChecksumCRC32;
          if (!remoteCrc32) {
            appLogger.warn(
              { uploadId, storageKey },
              "[finalizeUpload] Remote checksum unavailable after upload",
            );
          } else if (remoteCrc32 !== checksums.crc32Base64) {
            appLogger.error(
              {
                uploadId,
                storageKey,
                localCrc32: checksums.crc32Base64,
                remoteCrc32,
              },
              "[finalizeUpload] Remote checksum mismatch after upload - deleting corrupted object",
            );
            // Delete the corrupted S3 object
            try {
              await bucketService.deleteObjectFromBucket(storageKey);
              appLogger.info(
                { uploadId, storageKey },
                "[finalizeUpload] Corrupted object deleted from S3",
              );
            } catch (deleteErr) {
              appLogger.error(
                { uploadId, storageKey, err: deleteErr },
                "[finalizeUpload] Failed to delete corrupted object from S3",
              );
            }
            // Mark upload as failed and return error response
            chunkedUploadService.markFailed(
              uploadId,
              "Checksum mismatch: file may be corrupted during upload",
            );
            return res.status(500).json({
              error: "Checksum verification failed. The uploaded file may be corrupted.",
            });
          } else {
            appLogger.info(
              { uploadId, storageKey, crc32: remoteCrc32 },
              "[finalizeUpload] Remote checksum verified",
            );
          }
        } catch (checksumErr) {
          appLogger.warn(
            { uploadId, storageKey, err: checksumErr },
            "[finalizeUpload] Failed to fetch remote checksum metadata",
          );
        }
      }

      // Enqueue gradient generation job (non-blocking)
      enqueueGradientJob({
        guildId: metadata.guildId,
        galleryName: metadata.galleryName,
        storageKey,
        itemId: storageKey.replace(/\//g, "-"),
      }).catch((err) => {
        appLogger.error({ err, storageKey }, "[finalizeUpload] Failed to enqueue gradient job");
      });

      // Mark upload as completed
      chunkedUploadService.updateProgress(uploadId, "completed", "server-upload", {
        processedFiles: 1,
      });

      // Increment gallery item count by 1 for this single file upload
      await galleryController.incrementGalleryItemCount(metadata.guildId, metadata.galleryName, 1);

      appLogger.debug(
        { uploadId, guildId: metadata.guildId, galleryName: metadata.galleryName },
        "[finalizeUpload] Gallery item count incremented after single file upload",
      );

      return res.status(200).json(finalizeResponse);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      chunkedUploadService.markFailed(uploadId, errorMessage);
      appLogger.error(
        {
          err: error,
          uploadId,
          guildId: metadata.guildId,
          galleryName: metadata.galleryName,
          fileType: metadata.fileType,
          fileSize: metadata.totalSize,
        },
        "Single file upload failed",
      );
      return res.status(500).json({ error: "Failed to upload file", details: errorMessage });
    }
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: "Invalid request body" });
    }
    if ((err as Error)?.message?.includes("not found")) {
      return res.status(404).json({ error: "Upload session not found" });
    }
    appLogger.error({ err, uploadId }, "[finalizeUpload] error");
    res.status(500).json({ error: "Failed to finalize upload" });
  }
};

// Get upload progress
export const getUploadProgress = async (req: Request, res: Response) => {
  try {
    const { uploadId } = req.params;
    if (!uploadId) {
      return res.status(400).json({ error: "Missing uploadId parameter" });
    }

    const progress = chunkedUploadService.getProgress(uploadId);
    if (!progress) {
      return res.status(404).json({ error: "Upload session not found" });
    }

    res.status(200).json(progress);
  } catch (err: unknown) {
    appLogger.error({ err }, "[getUploadProgress] error");
    res.status(500).json({ error: "Failed to get upload progress" });
  }
};

// Cancel and cleanup a specific upload session
export const cancelUpload = async (req: Request, res: Response) => {
  try {
    const { uploadId } = req.params;
    if (!uploadId) {
      return res.status(400).json({ error: "Missing uploadId parameter" });
    }
    await chunkedUploadService.cleanupUpload(uploadId);
    chunkedUploadService.cleanupProgress(uploadId);
    res.status(200).json({ success: true });
  } catch (err: unknown) {
    appLogger.error({ err }, "[cancelUpload] error");
    res.status(500).json({ error: "Failed to cancel upload" });
  }
};

// Cleanup endpoint (could be called by a cron job or manually)
export const cleanupExpiredUploads = async (_req: Request, res: Response) => {
  try {
    const cleaned = await chunkedUploadService.cleanupExpiredUploads();
    res.status(200).json({ cleaned });
  } catch (err: unknown) {
    appLogger.error({ err }, "[cleanupExpiredUploads] error");
    res.status(500).json({ error: "Failed to cleanup expired uploads" });
  }
};
