import { toaster } from "@/components/ui/toaster";
import { setDefaultGuild } from "@/queries";
import { Button, HStack, Icon } from "@chakra-ui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { HiOutlineStar } from "react-icons/hi2";

export interface SetDefaultGuildButtonProps {
  defaultGuild: string;
  disabled?: boolean;
}

export const SetDefaultGuildButton = ({
  defaultGuild,
  disabled: disabledProp,
}: SetDefaultGuildButtonProps) => {
  const queryClient = useQueryClient();
  const setDefaultGuildMutation = useMutation({
    mutationFn: setDefaultGuild,
    onSuccess: () => {
      // Invalidate the default guild query so it refetches
      queryClient.invalidateQueries({ queryKey: ["defaultGuild"] });
    },
  });

  const setGuild = async () => {
    try {
      await setDefaultGuildMutation.mutateAsync(defaultGuild);
      toaster.success({ title: "Success", description: "Default guild set successfully." });
    } catch (err: unknown) {
      toaster.error({ title: "Error", description: "Failed to set default guild." });
      console.error("Error setting default guild:", err);
    }
  };

  return (
    <Button
      disabled={disabledProp}
      onClick={() => {
        void setGuild();
      }}
    >
      <HStack>
        <Icon>
          <HiOutlineStar />
        </Icon>
        Set Default Guild
      </HStack>
    </Button>
  );
};
