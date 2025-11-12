import { useQuery } from "@tanstack/react-query";
import { useContext } from "react";
import { getGalleryData } from "./queries";
import { AuthContext, getGuildIdFromUser } from "./utils";

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
};

export const useGalleryData = (guildId?: string) => {
  const { isAuthed, currentUser } = useAuth();
  const resolvedGuildId = guildId || getGuildIdFromUser(currentUser);
  const enabled = isAuthed && Boolean(resolvedGuildId);
  const query = useQuery({
    queryKey: ["galleries", { guildId: resolvedGuildId }],
    enabled,
    queryFn: () => getGalleryData(resolvedGuildId),
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
  const { data, isLoading, error } = useGalleryData();

  const gallery = data?.find((g) => g.name === galleryName) || null;
  return { data: gallery, isLoading, error };
};
