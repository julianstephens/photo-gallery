import { SetDefaultGuildButton } from "@/components/buttons";
import { GuildSelect } from "@/components/forms";
import { DetailedGallery, GalleryList, UploadMonitor } from "@/components/gallery";
import { CreateGalleryModal } from "@/components/modals";
import { Tooltip } from "@/components/ui/tooltip";
import {
  useAuth,
  useGalleryContext,
  useListGalleries,
  useUploadContext,
  useUploadPersistence,
} from "@/hooks";
import { Button, Flex, HStack, Icon, Presence, Spinner, Text, VStack } from "@chakra-ui/react";
import { useCallback, useEffect, useState } from "react";
import { HiOutlineUpload } from "react-icons/hi";
import { HiStar } from "react-icons/hi2";
import type { Gallery } from "utils";

const AdminGalleryManagerPage = () => {
  const [guildId, setGuildId] = useState<string | undefined>(undefined);
  const { currentUser } = useAuth();
  const userGuilds = currentUser?.guilds ?? [];
  const hasGuilds = userGuilds.length > 0;
  const effectiveGuildId = hasGuilds ? guildId || "" : "";
  const { data, error, isLoading } = useListGalleries(effectiveGuildId);
  const [showCreateGalleryModal, setShowCreateGalleryModal] = useState(false);
  const {
    uploadMonitorEverShown,
    hasActiveUploads,
    updateUploadMonitorVisibility,
    showUploadMonitor,
  } = useUploadContext();
  const {
    activeGalleryName,
    isDefaultGuild,
    setActiveGallery,
    clearActiveGallery,
    setActiveGuild,
    defaultGuildId,
  } = useGalleryContext();
  const [guild, setGuild] = useState<string>("");
  const [galleryOpened, setGalleryOpened] = useState(false);

  // Initialize upload persistence and check for persisted uploads
  const hasPersistedUploads = useUploadPersistence();

  // Auto-show monitor if there are persisted uploads on initial load
  useEffect(() => {
    if (hasPersistedUploads) {
      updateUploadMonitorVisibility(true);
    }
  }, [hasPersistedUploads, updateUploadMonitorVisibility]);

  const pageTitle = "Admin Gallery Manager";
  const pageSlug = pageTitle.toLowerCase().replace(/\s+/g, "-");

  const openCreateGalleryModal = () => {
    setShowCreateGalleryModal(true);
  };

  const closeCreateGalleryModal = () => {
    setShowCreateGalleryModal(false);
  };

  const openDetailedGalleryView = (gallery: Gallery) => {
    setActiveGallery(gallery.name);
    setGalleryOpened(true);
  };

  const closeDetailedGalleryView = useCallback(() => {
    clearActiveGallery();
    setGalleryOpened(false);
  }, [clearActiveGallery]);

  const onGuildChange = (selectedGuild: string) => {
    if (!hasGuilds) return;
    setGuild(selectedGuild);
    setGuildId(selectedGuild);
  };

  useEffect(() => {
    if (defaultGuildId && hasGuilds) {
      setGuild(defaultGuildId);
      setGuildId(defaultGuildId);
      // Immediately update context when default guild loads
      setActiveGuild(defaultGuildId);
    }
  }, [defaultGuildId, hasGuilds, setActiveGuild]);

  // Update GalleryContext when guild changes (for manual guild selection)
  useEffect(() => {
    if (guildId && hasGuilds) {
      setActiveGuild(guildId);
    }
  }, [guildId, hasGuilds, setActiveGuild]);

  // Check if gallery was deleted or renamed
  useEffect(() => {
    if (galleryOpened && activeGalleryName && data) {
      const galleryExists = data.some((g) => g.name === activeGalleryName);
      if (!galleryExists) {
        // Gallery not found (e.g., deleted or renamed), close the detailed view
        closeDetailedGalleryView();
      }
    }
  }, [data, galleryOpened, activeGalleryName, closeDetailedGalleryView]);

  return (
    <>
      {!hasGuilds ? (
        <Flex w="full" h="full" align="center" justify="center">
          <Text color="gray.400" textAlign="center">
            You don&apos;t belong to any guilds with admin access yet. Ask another admin to add you
            to a guild before managing galleries.
          </Text>
        </Flex>
      ) : (
        <Flex id={pageSlug} direction="column" w="full" h="full" gap="6" pb="10">
          <HStack
            id={`${pageSlug}-guild-select`}
            gap="4"
            w="full"
            align="center"
            backgroundColor="gray.900"
            p="4"
            borderRadius="md"
          >
            <VStack w="full" align="start">
              <HStack w="full" justify="space-between" align="last baseline" gap="4">
                <GuildSelect w="50%" value={guild} onChange={onGuildChange} />
                <SetDefaultGuildButton defaultGuild={guild} disabled={defaultGuildId === guild} />
              </HStack>
              {isDefaultGuild && (
                <HStack>
                  <Icon fill="green.400">
                    <HiStar />
                  </Icon>
                  <Text fontSize="sm" color="green.400">
                    This is your default guild
                  </Text>
                </HStack>
              )}
            </VStack>
          </HStack>
          <Presence
            id={`${pageSlug}-gallery-list-presence`}
            present={!galleryOpened}
            w="full"
            h="full"
          >
            <GalleryList
              data={data || undefined}
              error={error}
              isLoading={isLoading}
              guildId={guildId}
              openCreateGalleryModal={openCreateGalleryModal}
              openDetailedGalleryView={openDetailedGalleryView}
              pageSlug={pageSlug}
            />
          </Presence>
          {galleryOpened && activeGalleryName && (
            <DetailedGallery
              galleryName={activeGalleryName}
              guildId={guild}
              pageSlug={pageSlug}
              closeGallery={closeDetailedGalleryView}
            />
          )}
        </Flex>
      )}
      {hasGuilds && (
        <>
          <CreateGalleryModal
            guildId={guildId ?? ""}
            open={showCreateGalleryModal}
            closeModal={closeCreateGalleryModal}
          />
          <UploadMonitor
            isVisible={showUploadMonitor}
            onClose={() => updateUploadMonitorVisibility(false)}
          />
          {uploadMonitorEverShown && !showUploadMonitor && (
            <Tooltip content="View uploads">
              <Button
                zIndex={0}
                position="fixed"
                bottom="1rem"
                right="1rem"
                size="lg"
                colorPalette={hasActiveUploads ? "blue" : "gray"}
                aria-label="Show uploads"
                onClick={() => updateUploadMonitorVisibility(true)}
              >
                {hasActiveUploads ? (
                  <Spinner />
                ) : (
                  <Icon>
                    <HiOutlineUpload />
                  </Icon>
                )}
                {hasActiveUploads ? "Uploading" : "View Uploads"}
              </Button>
            </Tooltip>
          )}
        </>
      )}
    </>
  );
};

export default AdminGalleryManagerPage;
