import { setDefaultGuild } from "@/queries";
import { Button, Flex } from "@chakra-ui/react";
import { useMutation } from "@tanstack/react-query";
import { toaster } from "./ui/toaster";

export const SetDefaultGuildButton = ({ defaultGuild }: { defaultGuild: string }) => {
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
    <Flex gap="4" justify="space-between" align="center">
      <Button
        onClick={() => {
          void setGuild();
        }}
      >
        Set Default Guild
      </Button>
    </Flex>
  );
};
