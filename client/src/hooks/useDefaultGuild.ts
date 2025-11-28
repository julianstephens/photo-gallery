import { getDefaultGuild } from "@/queries";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";

export const useDefaultGuild = () => {
  const { currentUser } = useAuth();
  const { data: guildId } = useQuery({
    queryKey: ["defaultGuild", { userId: currentUser?.id }],
    queryFn: getDefaultGuild,
    enabled: Boolean(currentUser),
  });

  return guildId;
};
