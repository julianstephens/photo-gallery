import z from "zod";
import type { uploadJobSchema } from "../schemas/upload.ts";

export type UploadJobStatus = "pending" | "processing" | "completed" | "failed";

export type UploadJob = z.infer<typeof uploadJobSchema>;

export interface UploadJobProgress {
  processedFiles: number;
  totalFiles: number;
  uploadedFiles: Array<{ key: string; contentType: string | false | null }>;
  failedFiles: Array<{ filename: string; error: string }>;
}
