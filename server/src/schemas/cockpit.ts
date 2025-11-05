import { z } from "zod";

export const AssetMetaSchema = z.object({
  _id: z.string(),
  path: z.string(), // e.g., /storage/uploads/2025/11/uuid.jpg
  title: z.string().optional(),
  mime: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  size: z.number().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export type AssetMeta = z.infer<typeof AssetMetaSchema>;

export const GalleryItemSchema = z.object({
  _id: z.string(),
  title: z.string().default(""),
  slug: z.string().default(""),
  tags: z.array(z.string()).default([]),
  date: z.union([z.string(), z.date()]).optional(),
  asset: z.union([z.object({ _id: z.string() }), z.string()]).optional(),
});

export type GalleryItem = z.infer<typeof GalleryItemSchema>;
