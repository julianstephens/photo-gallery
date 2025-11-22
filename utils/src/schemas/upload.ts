import { z } from "zod";

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
