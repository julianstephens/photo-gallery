import { logger } from "@/lib/logger";
import { listGalleries } from "@/queries";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";

// 15 minutes in milliseconds - reduces API calls for infrequently changing data
const STALE_TIME = 15 * 60 * 1000;

export const useListGalleries = (guildId: string) => {
  const { isAuthed } = useAuth();
  const resolvedGuildId = guildId;
  const enabled = isAuthed && Boolean(resolvedGuildId);
  const query = useQuery({
    queryKey: ["galleries", { guildId: resolvedGuildId }],
    enabled,
    queryFn: () => listGalleries(resolvedGuildId),
    staleTime: STALE_TIME,
  });
  if (!enabled) {
    return {
      data: null,
      isLoading: false,
      error: !isAuthed ? Error("User not authenticated") : null,
    };
  }
  if (query.error) {
    logger.error({ error: query.error }, "Error fetching gallery data");
  }

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error ?? null,
  };
};
