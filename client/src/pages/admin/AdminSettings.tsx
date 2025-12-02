import { GuildSelect, NotificationSettings } from "@/components/forms";
import { Loader } from "@/components/Loader";
import { SettingsLayout, type SettingsTab } from "@/components/settings";
import { toaster } from "@/components/ui/toaster";
import { useAuth, useGalleryContext, useGuildSettings, useUpdateGuildSettings } from "@/hooks";
import { Flex, HStack, Text, VStack } from "@chakra-ui/react";
import { useCallback, useEffect, useState } from "react";
import { DEFAULT_GUILD_SETTINGS, type GuildSettings } from "utils";

const AdminSettingsPage = () => {
  const pageSlug = "admin-settings";
  const { currentUser } = useAuth();
  const { defaultGuildId } = useGalleryContext();
  const [guildId, setGuildId] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState("notifications");

  const userGuilds = currentUser?.guilds ?? [];
  const hasGuilds = userGuilds.length > 0;

  const { data: serverSettings, isLoading, error } = useGuildSettings(guildId);
  const { updateSettings, isUpdating } = useUpdateGuildSettings(guildId);

  useEffect(() => {
    if (defaultGuildId && hasGuilds) {
      setGuildId(defaultGuildId);
    }
  }, [defaultGuildId, hasGuilds]);

  const onGuildChange = (selectedGuild: string) => {
    if (!hasGuilds) return;
    setGuildId(selectedGuild);
  };

  const handleSettingsChange = useCallback(
    (newSettings: GuildSettings) => {
      if (!guildId) return;

      updateSettings(newSettings)
        .then(() => {
          toaster.success({
            title: "Settings saved",
            description: "Your settings have been updated successfully.",
          });
        })
        .catch((err) => {
          toaster.error({
            title: "Error saving settings",
            description:
              err instanceof Error ? err.message : "Failed to save settings. Please try again.",
          });
        });
    },
    [guildId, updateSettings],
  );

  const tabs: SettingsTab[] = [
    {
      id: "notifications",
      label: "Notifications",
      content: (
        <NotificationSettings
          settings={
            serverSettings ?? {
              notifications: {
                galleryExpiration: DEFAULT_GUILD_SETTINGS.notifications.galleryExpiration,
              },
            }
          }
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
    <VStack id={`${pageSlug}-container`} w="full" h="full" gap="6" align="stretch">
      <HStack
        id={`${pageSlug}-guild-selector`}
        w="full"
        p="4"
        bg="gray.900"
        borderRadius="md"
        align="center"
        justify="space-between"
      >
        <GuildSelect w="50%" value={guildId ?? ""} onChange={onGuildChange} invalid={false} />
      </HStack>

      {isLoading && <Loader text="Loading settings..." />}

      {error && !isLoading && (
        <Flex w="full" p="4" bg="red.900" borderRadius="md">
          <Text color="red.200">Failed to load settings: {error.message}</Text>
        </Flex>
      )}

      {!isLoading && !error && guildId && serverSettings && (
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
  );
};

export default AdminSettingsPage;
