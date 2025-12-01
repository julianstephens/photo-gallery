import { NotificationSettingsForm } from "@/components/forms/NotificationSettingsForm";
import { Loader } from "@/components/Loader";
import { HStack, Switch, Text, VStack } from "@chakra-ui/react";
import { type GuildSettings } from "utils";

export const NotificationSettings = ({
  settings,
  onSettingsChange,
  isSaving,
}: {
  settings: GuildSettings;
  onSettingsChange: (settings: GuildSettings) => void;
  isSaving: boolean;
}) => {
  const componentIdentifier = "notification-settings-form";

  const handleToggle = (enabled: boolean) => {
    onSettingsChange({
      ...settings,
      notifications: {
        ...settings.notifications,
        galleryExpiration: {
          ...settings.notifications.galleryExpiration,
          enabled,
        },
      },
    });
  };

  return (
    <VStack id={`${componentIdentifier}-container`} align="stretch" gap="6" as="form">
      <VStack id={`${componentIdentifier}-header`} align="start" gap="1">
        <Text fontSize="lg" fontWeight="semibold">
          Gallery Expiration Notifications
        </Text>
        <Text fontSize="sm" color="gray.500">
          Configure notifications for when galleries are about to expire.
        </Text>
      </VStack>

      <VStack
        id={`${componentIdentifier}-content`}
        align="stretch"
        gap="4"
        p="4"
        bg="gray.800"
        borderRadius="md"
      >
        <HStack id={`${componentIdentifier}-toggle`} justify="space-between" align="center">
          <VStack align="start" gap="0">
            <Text fontWeight="medium">Enable notifications</Text>
            <Text fontSize="sm" color="gray.500">
              Send alerts before galleries expire
            </Text>
          </VStack>
          <Switch.Root
            checked={settings.notifications.galleryExpiration.enabled}
            onCheckedChange={(e) => handleToggle(e.checked)}
            disabled={isSaving}
          >
            <Switch.HiddenInput />
            <Switch.Control bg="gray.600" _checked={{ bg: "blue.500" }}>
              <Switch.Thumb _checked={{ bg: "white" }} />
            </Switch.Control>
          </Switch.Root>
        </HStack>
        {isSaving && <Loader />}
        {!isSaving && settings.notifications.galleryExpiration.enabled && (
          <NotificationSettingsForm settings={settings} onSettingsChange={onSettingsChange} />
        )}
      </VStack>
    </VStack>
  );
};
