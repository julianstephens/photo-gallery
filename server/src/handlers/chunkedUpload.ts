import type { Request, Response } from "express";
import {
  initiateUploadRequestSchema,
  finalizeUploadRequestSchema,
  uploadChunkQuerySchema,
} from "utils";
import { ChunkedUploadService } from "../services/chunkedUpload.ts";
import { appLogger } from "../middleware/logger.ts";

const chunkedUploadService = new ChunkedUploadService();

export const initiateUpload = async (req: Request, res: Response) => {
  try {
    const body = initiateUploadRequestSchema.parse(req.body);
    const result = await chunkedUploadService.initiateUpload(body);
    res.status(201).json(result);
  } catch (err: unknown) {
    if ((err as { name?: string })?.name === "ZodError") {
      return res.status(400).json({ error: "Invalid request body" });
    }
    appLogger.error({ err }, "[initiateUpload] error");
    res.status(500).json({ error: "Failed to initiate upload" });
  }
};

export const uploadChunk = async (req: Request, res: Response) => {
  try {
    const query = uploadChunkQuerySchema.parse(req.query);
    const { uploadId, index } = query;

    // Get the chunk data from request body (raw buffer)
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const chunkBuffer = Buffer.concat(chunks);

    if (chunkBuffer.length === 0) {
      return res.status(400).json({ error: "Empty chunk data" });
    }

    await chunkedUploadService.saveChunk(uploadId, index, chunkBuffer);
    res.status(200).json({ success: true, index });
  } catch (err: unknown) {
    if ((err as { name?: string })?.name === "ZodError") {
      return res.status(400).json({ error: "Invalid query parameters" });
    }
    if ((err as Error)?.message?.includes("not found")) {
      return res.status(404).json({ error: "Upload session not found" });
    }
    appLogger.error({ err }, "[uploadChunk] error");
    res.status(500).json({ error: "Failed to upload chunk" });
  }
};

export const finalizeUpload = async (req: Request, res: Response) => {
  try {
    const body = finalizeUploadRequestSchema.parse(req.body);
    const result = await chunkedUploadService.finalizeUpload(body.uploadId);
    res.status(200).json(result);
  } catch (err: unknown) {
    if ((err as { name?: string })?.name === "ZodError") {
      return res.status(400).json({ error: "Invalid request body" });
    }
    if ((err as Error)?.message?.includes("not found")) {
      return res.status(404).json({ error: "Upload session not found" });
    }
    appLogger.error({ err }, "[finalizeUpload] error");
    res.status(500).json({ error: "Failed to finalize upload" });
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
