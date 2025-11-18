import { useQuery } from "@tanstack/react-query";
import { useContext } from "react";
import { getDefaultGuild, listGalleries, listGalleryItems } from "./queries";
import { AuthContext, getGuildIdFromUser } from "./utils";

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
};

export const useListGalleries = (guildId?: string) => {
  const { isAuthed, currentUser } = useAuth();
  const resolvedGuildId = guildId || getGuildIdFromUser(currentUser);
  const enabled = isAuthed && Boolean(resolvedGuildId);
  const query = useQuery({
    queryKey: ["galleries", { guildId: resolvedGuildId }],
    enabled,
    queryFn: () => listGalleries(resolvedGuildId),
  });
  if (!enabled) {
    return {
      data: null,
      isLoading: false,
      error: !isAuthed ? Error("User not authenticated") : null,
    };
  }
  if (query.error) {
    console.error("Error fetching gallery data:", query.error);
  }

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error ?? null,
  };
};

export const useSingleGalleryData = (galleryName: string) => {
  const { data, isLoading, error } = useListGalleries();

  const gallery = data?.find((g) => g.name === galleryName) || null;
  return { data: gallery, isLoading, error };
};

export const useDefaultGuild = () => {
  const { currentUser } = useAuth();
  const { data: guildId } = useQuery({
    queryKey: ["defaultGuild", { userId: currentUser?.id }],
    queryFn: getDefaultGuild,
    enabled: Boolean(currentUser),
  });

  return guildId;
};

export const useListGalleryItems = (galleryName: string) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["galleryItems", { galleryName }],
    queryFn: () => listGalleryItems(galleryName),
    enabled: Boolean(galleryName),
  });
  return { data, isLoading, error };
};
