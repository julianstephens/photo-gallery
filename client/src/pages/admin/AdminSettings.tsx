import { SettingsLayout, type SettingsTab } from "@/components/admin/SettingsLayout";
import { GuildSelect } from "@/components/forms";
import { Toaster, toaster } from "@/components/ui/toaster";
import { useAuth, useGalleryContext, useGuildSettings, useUpdateGuildSettings } from "@/hooks";
import {
  Button,
  Field,
  Flex,
  HStack,
  Input,
  Spinner,
  Switch,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useCallback, useEffect, useState } from "react";
import { DEFAULT_GUILD_SETTINGS, type GuildSettings } from "utils";

/**
 * Notification settings section component.
 */
const NotificationSettings = ({
  settings,
  onSettingsChange,
  isSaving,
}: {
  settings: GuildSettings;
  onSettingsChange: (settings: GuildSettings) => void;
  isSaving: boolean;
}) => {
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
    <VStack align="stretch" gap="6">
      <VStack align="start" gap="1">
        <Text fontSize="lg" fontWeight="semibold">
          Gallery Expiration Notifications
        </Text>
        <Text fontSize="sm" color="gray.500">
          Configure notifications for when galleries are about to expire.
        </Text>
      </VStack>

      <VStack align="stretch" gap="4" p="4" bg="gray.800" borderRadius="md">
        <HStack justify="space-between" align="center">
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
            <Switch.Control />
          </Switch.Root>
        </HStack>

        {settings.notifications.galleryExpiration.enabled && (
          <>
            <Field.Root>
              <Field.Label htmlFor="channelId">Discord Channel ID</Field.Label>
              <Input
                id="channelId"
                placeholder="Enter Discord channel ID"
                value={settings.notifications.galleryExpiration.channelId || ""}
                onChange={(e) => handleChannelChange(e.target.value)}
                disabled={isSaving}
              />
              <Text fontSize="xs" color="gray.500" mt="1">
                The channel where expiration notifications will be sent.
              </Text>
            </Field.Root>

            <Field.Root>
              <Field.Label htmlFor="daysBefore">Days before expiration</Field.Label>
              <Input
                id="daysBefore"
                type="number"
                min={1}
                max={30}
                value={settings.notifications.galleryExpiration.daysBefore}
                onChange={(e) => handleDaysChange(parseInt(e.target.value, 10) || 7)}
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

/**
 * Admin settings page with tabbed layout for guild-level settings.
 */
const AdminSettingsPage = () => {
  const { currentUser } = useAuth();
  const { defaultGuildId } = useGalleryContext();
  const [guildId, setGuildId] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState("notifications");
  const [localSettings, setLocalSettings] = useState<GuildSettings>(DEFAULT_GUILD_SETTINGS);
  const [hasChanges, setHasChanges] = useState(false);

  const userGuilds = currentUser?.guilds ?? [];
  const hasGuilds = userGuilds.length > 0;

  const { data: serverSettings, isLoading, error } = useGuildSettings(guildId);
  const { updateSettings, isUpdating, error: updateError } = useUpdateGuildSettings(guildId);

  // Initialize guild from default when available
  useEffect(() => {
    if (defaultGuildId && hasGuilds) {
      setGuildId(defaultGuildId);
    }
  }, [defaultGuildId, hasGuilds]);

  // Sync local settings with server settings
  useEffect(() => {
    if (serverSettings) {
      setLocalSettings(serverSettings);
      setHasChanges(false);
    }
  }, [serverSettings]);

  const onGuildChange = (selectedGuild: string) => {
    if (!hasGuilds) return;
    setGuildId(selectedGuild);
  };

  const handleSettingsChange = useCallback((newSettings: GuildSettings) => {
    setLocalSettings(newSettings);
    setHasChanges(true);
  }, []);

  const handleSave = async () => {
    if (!guildId) return;

    try {
      await updateSettings(localSettings);
      setHasChanges(false);
      toaster.success({
        title: "Settings saved",
        description: "Your settings have been updated successfully.",
      });
    } catch {
      toaster.error({
        title: "Error saving settings",
        description: updateError?.message || "Failed to save settings. Please try again.",
      });
    }
  };

  const handleReset = () => {
    if (serverSettings) {
      setLocalSettings(serverSettings);
      setHasChanges(false);
    }
  };

  const tabs: SettingsTab[] = [
    {
      id: "notifications",
      label: "Notifications",
      content: (
        <NotificationSettings
          settings={localSettings}
          onSettingsChange={handleSettingsChange}
          isSaving={isUpdating}
        />
      ),
    },
  ];

  if (!hasGuilds) {
    return (
      <Flex w="full" h="full" align="center" justify="center">
        <Text color="gray.400" textAlign="center">
          You don&apos;t belong to any guilds with admin access yet. Ask another admin to add you to
          a guild before configuring settings.
        </Text>
      </Flex>
    );
  }

  return (
    <>
      <VStack w="full" h="full" gap="6" align="stretch">
        {/* Guild selector */}
        <HStack
          w="full"
          p="4"
          bg="gray.900"
          borderRadius="md"
          align="center"
          justify="space-between"
        >
          <GuildSelect w="50%" value={guildId ?? ""} onChange={onGuildChange} invalid={false} />

          <HStack gap="3">
            {hasChanges && (
              <Button variant="ghost" onClick={handleReset} disabled={isUpdating}>
                Reset
              </Button>
            )}
            <Button
              colorPalette="blue"
              onClick={handleSave}
              disabled={!hasChanges || isUpdating || !guildId}
            >
              {isUpdating ? (
                <>
                  <Spinner size="sm" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </HStack>
        </HStack>

        {/* Loading state */}
        {isLoading && (
          <Flex w="full" h="200px" align="center" justify="center">
            <Spinner size="lg" />
          </Flex>
        )}

        {/* Error state */}
        {error && !isLoading && (
          <Flex w="full" p="4" bg="red.900" borderRadius="md">
            <Text color="red.200">Failed to load settings: {error.message}</Text>
          </Flex>
        )}

        {/* Settings layout */}
        {!isLoading && !error && guildId && (
          <SettingsLayout
            title="Guild Settings"
            description="Configure settings for your guild."
            tabs={tabs}
            activeTabId={activeTab}
            onTabChange={setActiveTab}
            backPath="/admin"
          />
        )}
      </VStack>
      <Toaster />
    </>
  );
};

export default AdminSettingsPage;
