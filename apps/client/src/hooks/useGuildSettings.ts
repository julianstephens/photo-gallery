import { getGuildSettings, updateGuildSettings } from "@/queries";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import type { GuildSettings } from "utils";
import { useAuth } from "./useAuth";

// 10 minutes in milliseconds - settings change infrequently
const STALE_TIME = 10 * 60 * 1000;

// Static error for unauthenticated users to avoid creating new Error on each render
const UNAUTHENTICATED_ERROR = new Error("User not authenticated");

/**
 * Hook to fetch guild settings.
 */
export const useGuildSettings = (guildId: string | undefined) => {
  const { isAuthed } = useAuth();
  const enabled = isAuthed && Boolean(guildId);

  const query = useQuery({
    queryKey: ["guildSettings", { guildId }],
    enabled,
    queryFn: () => getGuildSettings(guildId!),
    staleTime: STALE_TIME,
  });

  // Memoize the disabled state result to prevent unnecessary re-renders
  const disabledResult = useMemo(
    () => ({
      data: null,
      isLoading: false,
      error: !isAuthed ? UNAUTHENTICATED_ERROR : null,
    }),
    [isAuthed],
  );

  if (!enabled) {
    return disabledResult;
  }

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error ?? null,
  };
};

/**
 * Hook to update guild settings.
 */
export const useUpdateGuildSettings = (guildId: string | undefined) => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (settings: GuildSettings) => {
      if (!guildId) {
        throw new Error("Guild ID is required");
      }
      return updateGuildSettings(guildId, settings);
    },
    onSuccess: (data) => {
      // Update the cache with the new settings
      queryClient.setQueryData(["guildSettings", { guildId }], data);
    },
  });

  return {
    updateSettings: mutation.mutateAsync,
    isUpdating: mutation.isPending,
    error: mutation.error ?? null,
    isSuccess: mutation.isSuccess,
  };
};
