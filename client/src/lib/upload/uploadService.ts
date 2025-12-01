import { API_BASE_URL, httpClient } from "@/clients.ts";
import { logger } from "@/lib/logger";
import type { UploadProgress } from "utils";
import { chunkedUpload } from "./chunkedUpload";

export const initiateUpload = async (
  fileName: string,
  fileType: string,
  galleryName: string,
  totalSize: number,
  guildId: string,
) => {
  const { data } = await httpClient.post("/uploads/initiate", {
    fileName,
    fileType,
    galleryName,
    totalSize,
    guildId,
  });
  return data;
};

export const uploadChunk = async (
  uploadId: string,
  partNumber: number,
  chunk: Blob,
  onProgress?: (bytesLoaded: number) => void,
) => {
  const { data } = await httpClient.post(`/uploads/chunk`, chunk, {
    params: { uploadId, index: partNumber },
    headers: { "Content-Type": "application/octet-stream" },
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.loaded !== undefined) {
        onProgress(progressEvent.loaded);
      }
    },
  });
  return data;
};
export const finalizeUpload = async (uploadId: string) => {
  const { data } = await httpClient.post("/uploads/finalize", {
    uploadId,
  });
  return data;
};

export const cancelUpload = async (uploadId: string) => {
  await httpClient.delete(`/uploads/${uploadId}`);
};

export const getUploadProgress = async (uploadId: string): Promise<UploadProgress> => {
  const { data } = await httpClient.get<UploadProgress>(`/uploads/${uploadId}/progress`);
  return data;
};

/**
 * Upload a file in chunks with real-time progress tracking.
 * Uses chunkedUpload internally for reliable chunk uploads.
 *
 * Progress: 0-100% based on chunk upload completion.
 * Note: Server-side processing happens after finalization but is typically fast
 * for individual image uploads.
 */
export const uploadFileInChunks = async (
  file: File,
  galleryName: string,
  guildId: string,
  onProgress: (progress: number) => void,
) => {
  try {
    logger.info(
      { fileName: file.name, galleryName, guildId },
      "[uploadService] Starting file upload",
    );

    const result = await chunkedUpload(file, {
      galleryName,
      guildId,
      baseUrl: API_BASE_URL,
      onProgress: (chunkProgress) => {
        // Report chunk progress directly (0-100%)
        onProgress(chunkProgress.percentage);
      },
      // Don't use onServerProgress for simple uploads - it can cause
      // the progress to get stuck if the server doesn't track progress
      // or if the upload completes before polling starts
    });

    // Always report 100% on completion
    onProgress(100);

    if (!result.success) {
      logger.error({ fileName: file.name, error: result.error }, "[uploadService] Upload failed");
      throw new Error(result.error || "Upload failed");
    }

    logger.info(
      { fileName: file.name, filePath: result.filePath },
      "[uploadService] Upload completed successfully",
    );
    return result;
  } catch (error) {
    // Set progress to 100% on error to show 'complete but errored' state
    onProgress(100);
    logger.error(
      { fileName: file.name, error: error instanceof Error ? error.message : String(error) },
      "[uploadService] Upload error",
    );
    throw error;
  }
};
