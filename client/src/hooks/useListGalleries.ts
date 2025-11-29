import { logger } from "@/lib/logger";
import { listGalleries } from "@/queries";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";

export const useListGalleries = (guildId: string) => {
  const { isAuthed } = useAuth();
  const resolvedGuildId = guildId;
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
    logger.error({ error: query.error }, "Error fetching gallery data");
  }

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error ?? null,
  };
};
