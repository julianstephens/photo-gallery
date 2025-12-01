import { Field, HStack, Input, Switch, Text, VStack } from "@chakra-ui/react";
import { useMemo } from "react";
import type { GuildSettings } from "utils";

/**
 * Discord snowflake ID validation pattern (17-19 digits).
 */
const DISCORD_SNOWFLAKE_PATTERN = /^\d{17,19}$/;

/**
 * Validates if a string is a valid Discord snowflake ID.
 */
const isValidDiscordSnowflake = (id: string | null): boolean => {
  if (!id) return true; // Empty is valid (optional field)
  return DISCORD_SNOWFLAKE_PATTERN.test(id);
};

export const NotificationSettings = ({
  settings,
  onSettingsChange,
  isSaving,
}: {
  settings: GuildSettings;
  onSettingsChange: (settings: GuildSettings) => void;
  isSaving: boolean;
}) => {
  const componentIdentifier = "notification-settings";
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

  const handleChannelChange = (channelId: string) => {
    // Only allow digits or empty string (Discord snowflake IDs are 17-19 digits)
    if (channelId && !/^\d*$/.test(channelId)) {
      return; // Ignore non-digit input
    }
    onSettingsChange({
      ...settings,
      notifications: {
        ...settings.notifications,
        galleryExpiration: {
          ...settings.notifications.galleryExpiration,
          channelId: channelId || null,
        },
      },
    });
  };

  // Memoize channel ID error to avoid recalculation on every render
  const channelIdError = useMemo(() => {
    const channelId = settings.notifications.galleryExpiration.channelId;
    if (channelId && !isValidDiscordSnowflake(channelId)) {
      return "Channel ID must be 17-19 digits";
    }
    return undefined;
  }, [settings.notifications.galleryExpiration.channelId]);

  const handleDaysChange = (days: number) => {
    const validDays = Math.max(1, Math.min(30, days));
    onSettingsChange({
      ...settings,
      notifications: {
        ...settings.notifications,
        galleryExpiration: {
          ...settings.notifications.galleryExpiration,
          daysBefore: validDays,
        },
      },
    });
  };

  return (
    <VStack id={`${componentIdentifier}-container`} align="stretch" gap="6">
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
            id={`${componentIdentifier}-toggle-switch`}
            checked={settings.notifications.galleryExpiration.enabled}
            onCheckedChange={(e) => handleToggle(e.checked)}
            disabled={isSaving}
            colorPalette="blue"
          >
            <Switch.HiddenInput />
            <Switch.Control bg="gray.600" _checked={{ bg: "blue.600" }} />
          </Switch.Root>
        </HStack>

        {settings.notifications.galleryExpiration.enabled && (
          <>
            <Field.Root invalid={!!channelIdError}>
              <Field.Label htmlFor="channelId">Discord Channel ID</Field.Label>
              <Input
                id="channelId"
                placeholder="Enter Discord channel ID (17-19 digits)"
                value={settings.notifications.galleryExpiration.channelId || ""}
                onChange={(e) => handleChannelChange(e.target.value)}
                disabled={isSaving}
              />
              {channelIdError ? (
                <Field.ErrorText>{channelIdError}</Field.ErrorText>
              ) : (
                <Text fontSize="xs" color="gray.500" mt="1">
                  The channel where expiration notifications will be sent.
                </Text>
              )}
            </Field.Root>

            <Field.Root>
              <Field.Label htmlFor="daysBefore">Days before expiration</Field.Label>
              <Input
                id="daysBefore"
                type="number"
                min={1}
                max={30}
                value={settings.notifications.galleryExpiration.daysBefore}
                onChange={(e) =>
                  handleDaysChange(
                    parseInt(e.target.value, 10) ||
                      settings.notifications.galleryExpiration.daysBefore,
                  )
                }
                disabled={isSaving}
              />
              <Text fontSize="xs" color="gray.500" mt="1">
                How many days before expiration to send the notification (1-30).
              </Text>
            </Field.Root>
          </>
        )}
      </VStack>
    </VStack>
  );
};
