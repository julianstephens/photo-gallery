import { GalleryContext } from "@/contexts/galleryContextStore";
import { useContext } from "react";

export const useGalleryContext = () => {
  const context = useContext(GalleryContext);
  if (context === undefined) {
    throw new Error("useGalleryContext must be used within a GalleryProvider");
  }
  return context;
};
