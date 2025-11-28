import { useDefaultGuild } from "@/hooks";
import React, { createContext, useCallback, useContext, useState, type ReactNode } from "react";

interface GalleryContextType {
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

const GalleryContext = createContext<GalleryContextType | undefined>(undefined);

export const GalleryProvider = ({ children }: { children: ReactNode }) => {
  const [activeGuildId, setActiveGuildId] = useState<string | null>(null);
  const [activeGalleryName, setActiveGalleryName] = useState<string | null>(null);
  const defaultGuild = useDefaultGuild();
  const [defaultGuildId, setDefaultGuildId] = useState<string | null>(null);

  // Update defaultGuildId whenever the default guild changes
  React.useEffect(() => {
    setDefaultGuildId(defaultGuild ?? null);
  }, [defaultGuild]);

  const isDefaultGuild = activeGuildId === defaultGuildId && activeGuildId !== null;

  const setActiveGuild = useCallback((guildId: string) => {
    setActiveGuildId(guildId);
    // Clear the active gallery when switching guilds
    setActiveGalleryName(null);
  }, []);

  const setActiveGallery = useCallback((galleryName: string) => {
    setActiveGalleryName(galleryName);
  }, []);

  const clearActiveGallery = useCallback(() => {
    setActiveGalleryName(null);
  }, []);

  const updateGalleryName = useCallback(
    (oldName: string, newName: string) => {
      // If the renamed gallery is the active one, update the name
      if (activeGalleryName === oldName) {
        setActiveGalleryName(newName);
      }
    },
    [activeGalleryName],
  );

  const removeGallery = useCallback(
    (galleryName: string) => {
      // If the removed gallery is the active one, clear it
      if (activeGalleryName === galleryName) {
        setActiveGalleryName(null);
      }
    },
    [activeGalleryName],
  );

  const value: GalleryContextType = {
    activeGuildId,
    activeGalleryName,
    defaultGuildId,
    isDefaultGuild,
    setActiveGuild,
    setActiveGallery,
    clearActiveGallery,
    updateGalleryName,
    removeGallery,
  };

  return <GalleryContext.Provider value={value}>{children}</GalleryContext.Provider>;
};

export const useGalleryContext = () => {
  const context = useContext(GalleryContext);
  if (context === undefined) {
    throw new Error("useGalleryContext must be used within a GalleryProvider");
  }
  return context;
};
