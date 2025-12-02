import { getDefaultGuild } from "@/queries";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";

// 15 minutes in milliseconds - reduces API calls for infrequently changing data
const STALE_TIME = 15 * 60 * 1000;

export const useDefaultGuild = () => {
  const { currentUser } = useAuth();
  const { data: guildId } = useQuery({
    queryKey: ["defaultGuild", { userId: currentUser?.id }],
    queryFn: getDefaultGuild,
    enabled: Boolean(currentUser),
    staleTime: STALE_TIME,
  });

  return guildId;
};
