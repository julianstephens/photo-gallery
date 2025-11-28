import z from "zod";
import type {
  createGallerySchema,
  galleryMetaSchema,
  generateGradientJobSchema,
  gradientStatusSchema,
  imageGradientSchema,
  removeGallerySchema,
  setDefaultGallerySchema,
  storedGradientSchema,
  updateGalleryNameSchema,
  uploadToGallerySchema,
} from "../schemas/gallery.ts";

export type CreateGalleryRequest = z.infer<typeof createGallerySchema>;

export type GalleryMeta = z.infer<typeof galleryMetaSchema>;

export interface Gallery {
  name: string;
  meta: GalleryMeta;
}

export interface GalleryItemResponse {
  gallery: string;
  count: number;
  contents: Array<GalleryItem>;
}

export interface GalleryItem {
  name: string;
  size: number | undefined;
  content: GalleryItemContent | undefined;
  url: string;
  metadata: Record<string, string>;
  gradient?: ImageGradient | null; // Gradient metadata when available, null if failed, undefined if pending
}

export interface GalleryItemContent {
  data: Buffer;
  contentLength: number;
  contentType: string;
}

export type SetDefaultGalleryRequest = z.infer<typeof setDefaultGallerySchema>;

export type UploadToGalleryRequest = z.infer<typeof uploadToGallerySchema>;

export type RemoveGalleryRequest = z.infer<typeof removeGallerySchema>;

export type UpdateGalleryNameRequest = z.infer<typeof updateGalleryNameSchema>;

export type ImageGradient = z.infer<typeof imageGradientSchema>;

export type GenerateGradientJobData = z.infer<typeof generateGradientJobSchema>;

export type GradientStatus = z.infer<typeof gradientStatusSchema>;

export type StoredGradient = z.infer<typeof storedGradientSchema>;
