import { z } from "zod";

export const createGallerySchema = z.object({
  guildId: z.string().min(1).max(100),
  galleryName: z.string().min(1).max(100),
  ttlWeeks: z.number().min(1).max(6),
});

export const galleryMetaSchema = z.object({
  createdAt: z.number(),
  expiresAt: z.number(),
  ttlWeeks: z.number().min(1).max(6),
  createdBy: z.string().min(1).max(100),
  folderName: z.string().min(1).max(150).optional(),
  totalItems: z.number().min(0).default(0),
});

/**
 * Per-image metadata schema to store palette / gradient and placeholder.
 */
export const imageGradientSchema = z.object({
  palette: z.array(z.string()).optional(), // array of hex strings
  primary: z.string().optional(), // hex
  secondary: z.string().optional(), // hex
  foreground: z.string().optional(), // black/white hex
  css: z.string().optional(),
  // small blurred placeholder data URL to use as low-quality image placeholder
  blurDataUrl: z.string().optional(),
});

export const setDefaultGallerySchema = z.object({
  guildId: z.string().min(1).max(100),
  galleryName: z.string().min(1).max(100),
});

export const uploadToGallerySchema = z.object({
  guildId: z.string().min(1).max(100),
  galleryName: z.string().min(1).max(100),
  file: z.instanceof(File),
});

export const removeGallerySchema = z.object({
  guildId: z.string().min(1).max(100),
  galleryName: z.string().min(1).max(100),
});

export const updateGalleryNameSchema = z.object({
  guildId: z.string().min(1).max(100),
  galleryName: z.string().min(1).max(100),
  newGalleryName: z.string().min(1).max(100),
});

/**
 * Job data schema for gradient generation background worker.
 */
export const generateGradientJobSchema = z.object({
  guildId: z.string().min(1).max(100),
  galleryName: z.string().min(1).max(100),
  storageKey: z.string().min(1), // S3 object key for the image
  itemId: z.string().min(1), // Unique identifier for the gallery item (derived from storage key)
});

/**
 * Status of gradient generation for an image.
 */
export const gradientStatusSchema = z.enum([
  "pending", // Job queued, not yet processed
  "processing", // Currently being processed
  "completed", // Successfully generated
  "failed", // Failed after max retries, marked as no-gradient
]);

/**
 * Stored gradient metadata including status.
 */
export const storedGradientSchema = z.object({
  status: gradientStatusSchema,
  gradient: imageGradientSchema.optional(), // Only present when status is 'completed'
  attempts: z.number().int().min(0).default(0),
  lastError: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
