import z from "zod";

export const CreateGalleryRequestSchema = z.object({
  name: z.string().min(1, "Gallery name cannot be empty"),
});

export type CreateGalleryRequest = z.infer<typeof CreateGalleryRequestSchema>;
