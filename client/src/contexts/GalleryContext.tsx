import { useAuth, useDefaultGuild } from "@/hooks";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { GalleryContext, type GalleryContextType } from "./galleryContextStore";

export const GalleryProvider = ({ children }: { children: ReactNode }) => {
  const [activeGuildId, setActiveGuildId] = useState<string | null>(null);
  const [activeGalleryName, setActiveGalleryName] = useState<string | null>(null);
  const defaultGuild = useDefaultGuild();
  const [defaultGuildId, setDefaultGuildId] = useState<string | null>(null);
  const { currentUser } = useAuth();
  const userGuilds = useMemo(() => currentUser?.guilds ?? [], [currentUser]);
  const resolvedDefaultGuildId = useMemo(
    () => defaultGuild ?? userGuilds[0]?.id ?? null,
    [defaultGuild, userGuilds],
  );

  // Update defaultGuildId whenever the server default changes or fallbacks are needed
  useEffect(() => {
    setDefaultGuildId(resolvedDefaultGuildId ?? null);
  }, [resolvedDefaultGuildId]);

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

  // Automatically select a guild when one becomes available
  useEffect(() => {
    if (!activeGuildId && resolvedDefaultGuildId) {
      setActiveGuild(resolvedDefaultGuildId);
    }
  }, [activeGuildId, resolvedDefaultGuildId, setActiveGuild]);

  // Ensure active guild remains valid if memberships change
  useEffect(() => {
    if (!activeGuildId) {
      return;
    }
    const stillMember = userGuilds.some((guild) => guild.id === activeGuildId);
    if (!stillMember) {
      if (resolvedDefaultGuildId) {
        setActiveGuild(resolvedDefaultGuildId);
      } else {
        setActiveGuildId(null);
        setActiveGalleryName(null);
      }
    }
  }, [activeGuildId, resolvedDefaultGuildId, setActiveGalleryName, setActiveGuild, userGuilds]);

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

  const value = useMemo<GalleryContextType>(
    () => ({
      activeGuildId,
      activeGalleryName,
      defaultGuildId,
      isDefaultGuild,
      setActiveGuild,
      setActiveGallery,
      clearActiveGallery,
      updateGalleryName,
      removeGallery,
    }),
    [
      activeGuildId,
      activeGalleryName,
      defaultGuildId,
      isDefaultGuild,
      setActiveGuild,
      setActiveGallery,
      clearActiveGallery,
      updateGalleryName,
      removeGallery,
    ],
  );

  return <GalleryContext.Provider value={value}>{children}</GalleryContext.Provider>;
};

export type { GalleryContextType };
