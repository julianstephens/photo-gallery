import { setDefaultGuild } from "@/queries";
import { Button, HStack, Icon } from "@chakra-ui/react";
import { useMutation } from "@tanstack/react-query";
import { toaster } from "./ui/toaster";
import { HiOutlineStar } from "react-icons/hi2";

export interface SetDefaultGuildButtonProps {
  defaultGuild: string;
  disabled?: boolean;
}

export const SetDefaultGuildButton = ({ defaultGuild, disabled }: SetDefaultGuildButtonProps) => {
  const setDefaultGuildMutation = useMutation({
    mutationFn: setDefaultGuild,
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
      disabled={disabled}
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
