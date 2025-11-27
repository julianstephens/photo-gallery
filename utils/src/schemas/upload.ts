import { z } from "zod";

// Chunked upload schemas
export const initiateUploadRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileType: z.string().regex(/^[a-z]+\/[a-z0-9\-+.]+$/i, { message: "Invalid MIME type format" }),
  galleryName: z.string().min(1),
  totalSize: z.number().int().min(0),
});

export const initiateUploadResponseSchema = z.object({
  uploadId: z.string(),
});

// Maximum chunk index to prevent abuse (supports files up to ~100GB with 10MB chunks)
const MAX_CHUNK_INDEX = 10000;

export const uploadChunkQuerySchema = z.object({
  uploadId: z.string().min(1),
  index: z.coerce.number().int().min(0).max(MAX_CHUNK_INDEX),
});

export const finalizeUploadRequestSchema = z.object({
  uploadId: z.string().min(1),
});

export const finalizeUploadResponseSchema = z.object({
  success: z.boolean(),
  filePath: z.string(),
});

export const uploadJobSchema = z.object({
  jobId: z.string(),
  status: z.enum(["pending", "processing", "completed", "failed"]),
  galleryName: z.string(),
  guildId: z.string(),
  filename: z.string(),
  fileSize: z.number(),
  createdAt: z.number(),
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
  progress: z
    .object({
      processedFiles: z.number(),
      totalFiles: z.number(),
      uploadedFiles: z.array(
        z.object({
          key: z.string(),
          contentType: z.union([z.string(), z.literal(false), z.null()]),
        }),
      ),
      failedFiles: z.array(
        z.object({
          filename: z.string(),
          error: z.string(),
        }),
      ),
    })
    .optional(),
  error: z.string().optional(),
});

// Upload progress tracking schemas
export const uploadProgressStatusSchema = z.enum([
  "pending",
  "uploading",
  "processing",
  "completed",
  "failed",
]);

export const uploadProgressPhaseSchema = z.enum([
  "client-upload",
  "server-assemble",
  "server-zip-extract",
  "server-upload",
]);

export const uploadProgressSchema = z.object({
  uploadId: z.string(),
  status: uploadProgressStatusSchema,
  phase: uploadProgressPhaseSchema,
  progress: z.object({
    totalBytes: z.number().nullable(),
    uploadedBytes: z.number().nullable(),
    totalFiles: z.number().nullable(),
    processedFiles: z.number().nullable(),
  }),
  error: z.string().nullable(),
});
