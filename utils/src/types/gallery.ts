import z from "zod";
import type { createGallerySchema, galleryMetaSchema } from "../schemas/gallery.ts";

export type CreateGalleryRequest = z.infer<typeof createGallerySchema>;

export type GalleryMeta = z.infer<typeof galleryMetaSchema>;

export interface Gallery {
  name: string;
  meta: GalleryMeta;
}
