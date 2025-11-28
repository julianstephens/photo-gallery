import { DetailedGallery } from "@/components/DetailedGallery";
import { GuildSelect } from "@/components/forms/Fields";
import { GalleryList } from "@/components/GalleryList";
import { CreateGalleryModal } from "@/components/modals/CreateGalleryModal";
import { SetDefaultGuildButton } from "@/components/SetDefaultGuild";
import { Tooltip } from "@/components/ui/tooltip";
import { UploadMonitor } from "@/components/UploadMonitor";
import { useGalleryContext } from "@/contexts/GalleryContext";
import { useUploadContext } from "@/contexts/UploadContext";
import { useListGalleries } from "@/hooks";
import {
  Button,
  Flex,
  Heading,
  HStack,
  Icon,
  IconButton,
  Presence,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { HiOutlineHome, HiOutlineUpload } from "react-icons/hi";
import { HiStar } from "react-icons/hi2";
import { useNavigate } from "react-router";
import type { Gallery } from "utils";

const AdminDashboard = () => {
  const [guildId, setGuildId] = useState<string | undefined>(undefined);
  const { data, error, isLoading } = useListGalleries(guildId || "");
  const [showCreateGalleryModal, setShowCreateGalleryModal] = useState(false);
  const { uploadMonitorEverShown, hasActiveUploads } = useUploadContext();
  const {
    activeGalleryName,
    isDefaultGuild,
    setActiveGallery,
    clearActiveGallery,
    setActiveGuild,
    defaultGuildId,
  } = useGalleryContext();
  const [isUploadMonitorVisible, setIsUploadMonitorVisible] = useState(true);
  const [guild, setGuild] = useState<string>("");
  const [galleryOpened, setGalleryOpened] = useState(false);

  const goto = useNavigate();

  const pageTitle = "Admin Dashboard";
  const pageSlug = pageTitle.toLowerCase().replace(/\s+/g, "-").toLowerCase();

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

  const closeDetailedGalleryView = () => {
    clearActiveGallery();
    setGalleryOpened(false);
  };

  const onGuildChange = (selectedGuild: string) => {
    setGuild(selectedGuild);
    setGuildId(selectedGuild);
  };

  useEffect(() => {
    if (defaultGuildId) {
      setGuild(defaultGuildId);
      setGuildId(defaultGuildId);
      // Immediately update context when default guild loads
      setActiveGuild(defaultGuildId);
    }
  }, [defaultGuildId, setActiveGuild]);

  // Update GalleryContext when guild changes (for manual guild selection)
  useEffect(() => {
    if (guildId) {
      setActiveGuild(guildId);
    }
  }, [guildId, setActiveGuild]);

  // Check if gallery was deleted or renamed
  useEffect(() => {
    if (galleryOpened && activeGalleryName && data) {
      const galleryExists = data.some((g) => g.name === activeGalleryName);
      if (!galleryExists) {
        // Gallery not found (e.g., deleted or renamed), close the detailed view
        closeDetailedGalleryView();
      }
    }
  }, [data, galleryOpened, activeGalleryName]);

  return (
    <>
      <Flex id={pageSlug} direction="column" height="full" gap="6">
        <HStack id={`${pageSlug}-header`} align="center" justify="space-between">
          <VStack align="start" gap="0">
            <Heading size="lg">{pageTitle}</Heading>
            <Text fontSize="sm" color="gray.500">
              Welcome to the admin dashboard. Here you can manage the application.
            </Text>
          </VStack>
          <Tooltip content="Home">
            <IconButton
              variant="ghost"
              size="xl"
              aria-label="Home"
              onClick={() => {
                goto("/");
              }}
            >
              <HiOutlineHome />
            </IconButton>
          </Tooltip>
        </HStack>
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
      <CreateGalleryModal
        guildId={guildId ?? ""}
        open={showCreateGalleryModal}
        closeModal={closeCreateGalleryModal}
      />
      <UploadMonitor
        isVisible={isUploadMonitorVisible}
        onClose={() => setIsUploadMonitorVisible(false)}
      />
      {uploadMonitorEverShown && !isUploadMonitorVisible && (
        <Tooltip content="View uploads">
          <Button
            zIndex={0}
            position="fixed"
            bottom="1rem"
            right="1rem"
            size="lg"
            colorPalette={hasActiveUploads ? "blue" : "gray"}
            aria-label="Show uploads"
            onClick={() => setIsUploadMonitorVisible(true)}
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
  );
};

export default AdminDashboard;
