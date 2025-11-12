import { GuildSelect } from "@/components/forms/Fields";
import { GalleryItem } from "@/components/GalleryItem";
import { CreateGalleryModal } from "@/components/modals/CreateGalleryModal";
import { FilePickerModal } from "@/components/modals/FilePickerModal";
import { useGalleryData } from "@/hooks";
import { Button, Flex, Heading, Loader, Text } from "@chakra-ui/react";
import { useState } from "react";

const AdminDashboard = () => {
  const [guildId, setGuildId] = useState<string | undefined>(undefined);
  const { data, error, isLoading } = useGalleryData(guildId);
  const [showCreateGalleryModal, setShowCreateGalleryModal] = useState(false);
  const [showFilePickerModal, setShowFilePickerModal] = useState(false);

  const [guild, setGuild] = useState<string>("");

  const pageTitle = "Admin Dashboard";
  const pageSlug = pageTitle.toLowerCase().replace(/\s+/g, "-").toLowerCase();

  const openCreateGalleryModal = () => {
    setShowCreateGalleryModal(true);
  };

  const closeCreateGalleryModal = () => {
    setShowCreateGalleryModal(false);
  };

  const openFilePickerModal = () => {
    setShowFilePickerModal(true);
  };

  const closeFilePickerModal = () => {
    setShowFilePickerModal(false);
  };

  const onGuildChange = (selectedGuild: string) => {
    setGuild(selectedGuild);
    setGuildId(selectedGuild);
  };

  return (
    <>
      <Flex id={pageSlug} direction="column" height="full" gap="6">
        <Flex id={`${pageSlug}-header`} direction="column" gap="2">
          <Heading size="2xl">{pageTitle}</Heading>
          <p>Welcome to the admin dashboard. Here you can manage the application.</p>
        </Flex>
        <Flex direction="row" gap="4" w="full" align="center">
          <GuildSelect maxW="50%" value={guild} onChange={onGuildChange} />
          <Button ms="auto" colorPalette="blue" onClick={openCreateGalleryModal}>
            Create Gallery
          </Button>
        </Flex>
        {isLoading ? (
          <Loader />
        ) : error || !data ? (
          <Text>Error loading galleries.</Text>
        ) : data.length === 0 ? (
          <Text>No galleries found for the selected guild.</Text>
        ) : (
          <Flex direction="column" gap="4" w="full">
            {data?.map((gallery) => (
              <GalleryItem
                key={gallery.name}
                info={gallery}
                openFilePickerModal={openFilePickerModal}
              />
            ))}
          </Flex>
        )}
      </Flex>
      <CreateGalleryModal open={showCreateGalleryModal} closeModal={closeCreateGalleryModal} />
      <FilePickerModal open={showFilePickerModal} closeModal={closeFilePickerModal} />
    </>
  );
};

export default AdminDashboard;
