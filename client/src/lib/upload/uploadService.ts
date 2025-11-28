import { API_BASE_URL, httpClient } from "@/clients.ts";
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
 * Uses chunkedUpload internally with server-side progress polling for a smooth progress bar.
 *
 * Progress phases:
 * - 0-90%: Chunk upload progress
 * - 90-100%: Server-side processing (zip extraction, bucket uploads)
 */
export const uploadFileInChunks = async (
  file: File,
  galleryName: string,
  guildId: string,
  onProgress: (progress: number) => void,
) => {
  // Reserve 10% for server-side processing
  const UPLOAD_PHASE_MAX = 90;

  try {
    const result = await chunkedUpload(file, {
      galleryName,
      guildId,
      baseUrl: API_BASE_URL,
      onProgress: (chunkProgress) => {
        // Scale chunk progress to 0-90%
        const scaledProgress = (chunkProgress.percentage / 100) * UPLOAD_PHASE_MAX;
        onProgress(scaledProgress);
      },
      onServerProgress: (serverProgress) => {
        // Map server-side processing to 90-100%
        const { progress } = serverProgress;
        let serverPercentage = 0;

        if (progress.totalFiles && progress.processedFiles) {
          serverPercentage = (progress.processedFiles / progress.totalFiles) * 100;
        } else if (progress.totalBytes && progress.uploadedBytes) {
          serverPercentage = (progress.uploadedBytes / progress.totalBytes) * 100;
        }

        // Scale server progress to 90-100%
        const scaledProgress =
          UPLOAD_PHASE_MAX + (serverPercentage / 100) * (100 - UPLOAD_PHASE_MAX);
        onProgress(scaledProgress);
      },
    });

    // Always report 100% on completion
    onProgress(100);

    if (!result.success) {
      throw new Error(result.error || "Upload failed");
    }

    return result;
  } catch (error) {
    // Set progress to 100% on error to show 'complete but errored' state
    onProgress(100);
    throw error;
  }
};
