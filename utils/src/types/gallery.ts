import z from "zod";
import type {
  createGallerySchema,
  galleryMetaSchema,
  removeGallerySchema,
  setDefaultGallerySchema,
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
