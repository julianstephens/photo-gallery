import { useListGalleries } from "./useListGalleries";

export const useSingleGalleryData = (guildId: string, galleryName: string) => {
  const { data, isLoading, error } = useListGalleries(guildId);

  const gallery = data?.find((g) => g.name === galleryName) || null;
  return { data: gallery, isLoading, error };
};
