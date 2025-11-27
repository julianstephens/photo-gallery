import type {
  ChunkedUploadProgress,
  FinalizeUploadResponse,
  InitiateUploadRequest,
  InitiateUploadResponse,
} from "utils";
import { uploadHttpClient } from "./clients";

const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export interface ChunkedUploadOptions {
  chunkSize?: number;
  maxRetries?: number;
  galleryName?: string;
  onProgress?: (progress: ChunkedUploadProgress) => void;
  onChunkComplete?: (index: number, total: number) => void;
  onError?: (error: Error, chunk: number) => void;
}

export interface ChunkedUploadResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

/**
 * Slice a file into chunks
 */
function sliceFile(file: File, chunkSize: number): Blob[] {
  const chunks: Blob[] = [];
  let offset = 0;
  while (offset < file.size) {
    chunks.push(file.slice(offset, offset + chunkSize));
    offset += chunkSize;
  }
  return chunks;
}

/**
 * Delay for retry
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Upload a single chunk with retry logic
 */
async function uploadChunkWithRetry(
  uploadId: string,
  index: number,
  chunk: Blob,
  maxRetries: number,
  onError?: (error: Error, chunk: number) => void,
): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Use Blob directly to reduce memory overhead
      await uploadHttpClient.post("uploads/chunk", chunk, {
        params: { uploadId, index },
        headers: {
          "Content-Type": "application/octet-stream",
        },
      });
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      onError?.(lastError, index);

      if (attempt < maxRetries - 1) {
        await delay(RETRY_DELAY_MS * Math.pow(2, attempt));
      }
    }
  }

  throw lastError || new Error(`Failed to upload chunk ${index} after ${maxRetries} retries`);
}

/**
 * Perform a chunked file upload
 */
export async function chunkedUpload(
  file: File,
  options: ChunkedUploadOptions = {},
): Promise<ChunkedUploadResult> {
  const {
    chunkSize = DEFAULT_CHUNK_SIZE,
    maxRetries = MAX_RETRIES,
    onProgress,
    onChunkComplete,
    onError,
  } = options;

  let uploadId: string | null = null;

  try {
    // Step 1: Initiate upload
    const initiateRequest: InitiateUploadRequest = {
      fileName: file.name,
      fileType: file.type || "application/octet-stream",
      totalSize: file.size,
      galleryName: options.galleryName || "unknown",
    };

    const { data: initiateResponse } = await uploadHttpClient.post<InitiateUploadResponse>(
      "uploads/initiate",
      initiateRequest,
    );

    uploadId = initiateResponse.uploadId;

    // Slice file into chunks
    const chunks = sliceFile(file, chunkSize);
    const totalChunks = chunks.length;

    // Step 2: Upload each chunk
    for (let i = 0; i < chunks.length; i++) {
      await uploadChunkWithRetry(uploadId, i, chunks[i], maxRetries, onError);

      onChunkComplete?.(i, totalChunks);

      const progress: ChunkedUploadProgress = {
        uploadId,
        totalChunks,
        uploadedChunks: i + 1,
        percentage: Math.round(((i + 1) / totalChunks) * 100),
      };
      onProgress?.(progress);
    }

    // Step 3: Finalize upload
    const { data: finalizeResponse } = await uploadHttpClient.post<FinalizeUploadResponse>(
      "uploads/finalize",
      { uploadId },
    );

    return {
      success: finalizeResponse.success,
      filePath: finalizeResponse.filePath,
    };
  } catch (error) {
    // Cleanup server session on error to prevent orphaned temporary files
    if (uploadId) {
      try {
        await uploadHttpClient.delete(`uploads/${uploadId}`);
      } catch {
        // Ignore cleanup errors - the session will be cleaned up by TTL
      }
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * ChunkedUploader class for more control over the upload process
 */
export class ChunkedUploader {
  private file: File;
  private options: ChunkedUploadOptions;
  private uploadId: string | null = null;
  private chunks: Blob[] = [];
  private uploadedChunks = 0;
  private aborted = false;

  constructor(file: File, options: ChunkedUploadOptions = {}) {
    this.file = file;
    this.options = {
      chunkSize: DEFAULT_CHUNK_SIZE,
      maxRetries: MAX_RETRIES,
      ...options,
    };
  }

  async start(): Promise<ChunkedUploadResult> {
    if (this.aborted) {
      return { success: false, error: "Upload was aborted" };
    }

    try {
      // Step 1: Initiate upload
      const initiateRequest: InitiateUploadRequest = {
        fileName: this.file.name,
        fileType: this.file.type || "application/octet-stream",
        totalSize: this.file.size,
        galleryName: this.options.galleryName || "unknown",
      };

      const { data: initiateResponse } = await uploadHttpClient.post<InitiateUploadResponse>(
        "uploads/initiate",
        initiateRequest,
      );

      this.uploadId = initiateResponse.uploadId;

      // Slice file into chunks
      const chunkSize = this.options.chunkSize ?? DEFAULT_CHUNK_SIZE;
      this.chunks = sliceFile(this.file, chunkSize);
      const totalChunks = this.chunks.length;

      // Step 2: Upload each chunk
      const maxRetries = this.options.maxRetries ?? MAX_RETRIES;
      for (let i = 0; i < this.chunks.length; i++) {
        if (this.aborted) {
          return { success: false, error: "Upload was aborted" };
        }

        await uploadChunkWithRetry(
          this.uploadId,
          i,
          this.chunks[i],
          maxRetries,
          this.options.onError,
        );

        this.uploadedChunks = i + 1;
        this.options.onChunkComplete?.(i, totalChunks);

        const progress: ChunkedUploadProgress = {
          uploadId: this.uploadId,
          totalChunks,
          uploadedChunks: this.uploadedChunks,
          percentage: Math.round((this.uploadedChunks / totalChunks) * 100),
        };
        this.options.onProgress?.(progress);
      }

      // Step 3: Finalize upload
      const { data: finalizeResponse } = await uploadHttpClient.post<FinalizeUploadResponse>(
        "uploads/finalize",
        { uploadId: this.uploadId },
      );

      return {
        success: finalizeResponse.success,
        filePath: finalizeResponse.filePath,
      };
    } catch (error) {
      // Cleanup server session on error to prevent orphaned temporary files
      if (this.uploadId) {
        try {
          await uploadHttpClient.delete(`uploads/${this.uploadId}`);
        } catch {
          // Ignore cleanup errors - the session will be cleaned up by TTL
        }
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  abort(): void {
    this.aborted = true;
    if (this.uploadId) {
      void this.cleanupServerSession();
    }
  }

  /**
   * Clean up the server-side upload session when aborting.
   * This prevents orphaned temporary files from consuming disk space.
   */
  private async cleanupServerSession(): Promise<void> {
    if (!this.uploadId) return;
    try {
      await uploadHttpClient.delete(`uploads/${this.uploadId}`);
    } catch {
      // Ignore errors during cleanup - the session will be cleaned up by TTL
    }
  }

  getProgress(): ChunkedUploadProgress | null {
    if (!this.uploadId) return null;
    return {
      uploadId: this.uploadId,
      totalChunks: this.chunks.length,
      uploadedChunks: this.uploadedChunks,
      percentage:
        this.chunks.length > 0 ? Math.round((this.uploadedChunks / this.chunks.length) * 100) : 0,
    };
  }
}
