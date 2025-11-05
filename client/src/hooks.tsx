import { useQuery } from "@tanstack/react-query";
import { getGalleryData } from "./queries";

export const useGalleryData = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["galleryData"],
    queryFn: getGalleryData,
  });

  if (error) {
    console.error("Error fetching gallery data:", error);
  }

  return { data, isLoading, error };
};
