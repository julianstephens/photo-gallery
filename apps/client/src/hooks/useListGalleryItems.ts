import { listGalleryItems } from "@/queries";
import { useQuery } from "@tanstack/react-query";

export const useListGalleryItems = (guildId: string, galleryName: string) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["galleryItems", { guildId, galleryName }],
    queryFn: () => listGalleryItems(guildId, galleryName),
    enabled: Boolean(guildId && galleryName),
  });
  return { data, isLoading, error };
};
