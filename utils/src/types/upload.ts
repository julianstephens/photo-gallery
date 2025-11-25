import z from "zod";
import type {
  uploadJobSchema,
  initiateUploadRequestSchema,
  initiateUploadResponseSchema,
  uploadChunkQuerySchema,
  finalizeUploadRequestSchema,
  finalizeUploadResponseSchema,
} from "../schemas/upload.ts";

export type UploadJobStatus = "pending" | "processing" | "completed" | "failed";

export type UploadJob = z.infer<typeof uploadJobSchema>;

export interface UploadJobProgress {
  processedFiles: number;
  totalFiles: number;
  uploadedFiles: Array<{ key: string; contentType: string | false | null }>;
  failedFiles: Array<{ filename: string; error: string }>;
}

// Chunked upload types
export type InitiateUploadRequest = z.infer<typeof initiateUploadRequestSchema>;
export type InitiateUploadResponse = z.infer<typeof initiateUploadResponseSchema>;
export type UploadChunkQuery = z.infer<typeof uploadChunkQuerySchema>;
export type FinalizeUploadRequest = z.infer<typeof finalizeUploadRequestSchema>;
export type FinalizeUploadResponse = z.infer<typeof finalizeUploadResponseSchema>;

export interface ChunkedUploadProgress {
  uploadId: string;
  totalChunks: number;
  uploadedChunks: number;
  percentage: number;
}
