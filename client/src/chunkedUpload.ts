import { uploadHttpClient } from "./clients";
import type {
  ChunkedUploadProgress,
  InitiateUploadRequest,
  InitiateUploadResponse,
  FinalizeUploadResponse,
} from "utils";

const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export interface ChunkedUploadOptions {
  chunkSize?: number;
  maxRetries?: number;
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
      const arrayBuffer = await chunk.arrayBuffer();
      await uploadHttpClient.post(
        `uploads/chunk?uploadId=${uploadId}&index=${index}`,
        arrayBuffer,
        {
          headers: {
            "Content-Type": "application/octet-stream",
          },
        },
      );
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      onError?.(lastError, index);

      if (attempt < maxRetries - 1) {
        await delay(RETRY_DELAY_MS * (attempt + 1));
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

  try {
    // Step 1: Initiate upload
    const initiateRequest: InitiateUploadRequest = {
      fileName: file.name,
      fileType: file.type || "application/octet-stream",
    };

    const { data: initiateResponse } = await uploadHttpClient.post<InitiateUploadResponse>(
      "uploads/initiate",
      initiateRequest,
    );

    const { uploadId } = initiateResponse;

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
      };

      const { data: initiateResponse } = await uploadHttpClient.post<InitiateUploadResponse>(
        "uploads/initiate",
        initiateRequest,
      );

      this.uploadId = initiateResponse.uploadId;

      // Slice file into chunks
      this.chunks = sliceFile(this.file, this.options.chunkSize!);
      const totalChunks = this.chunks.length;

      // Step 2: Upload each chunk
      for (let i = 0; i < this.chunks.length; i++) {
        if (this.aborted) {
          return { success: false, error: "Upload was aborted" };
        }

        await uploadChunkWithRetry(
          this.uploadId,
          i,
          this.chunks[i],
          this.options.maxRetries!,
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  abort(): void {
    this.aborted = true;
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
