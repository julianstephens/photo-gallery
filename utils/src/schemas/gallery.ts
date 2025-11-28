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
