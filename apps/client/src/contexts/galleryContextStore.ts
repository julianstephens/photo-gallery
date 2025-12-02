import { createContext } from "react";

export interface GalleryContextType {
  activeGuildId: string | null;
  activeGalleryName: string | null;
  defaultGuildId: string | null;
  isDefaultGuild: boolean;
  setActiveGuild: (guildId: string) => void;
  setActiveGallery: (galleryName: string) => void;
  clearActiveGallery: () => void;
  updateGalleryName: (oldName: string, newName: string) => void;
  removeGallery: (galleryName: string) => void;
}

export const GalleryContext = createContext<GalleryContextType | undefined>(undefined);
