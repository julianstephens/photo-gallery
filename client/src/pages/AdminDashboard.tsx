import { GuildSelect } from "@/components/forms/Fields";
import { GalleryCard } from "@/components/GalleryCard";
import { CreateGalleryModal } from "@/components/modals/CreateGalleryModal";
import { SetDefaultGuildButton } from "@/components/SetDefaultGuild";
import { useDefaultGuild, useListGalleries } from "@/hooks";
import { Button, Flex, Heading, Loader, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";

const AdminDashboard = () => {
  const [guildId, setGuildId] = useState<string | undefined>(undefined);
  const { data, error, isLoading } = useListGalleries(guildId);
  const defaultGuild = useDefaultGuild();
  const [showCreateGalleryModal, setShowCreateGalleryModal] = useState(false);

  const [guild, setGuild] = useState<string>("");

  const pageTitle = "Admin Dashboard";
  const pageSlug = pageTitle.toLowerCase().replace(/\s+/g, "-").toLowerCase();

  const openCreateGalleryModal = () => {
    setShowCreateGalleryModal(true);
  };

  const closeCreateGalleryModal = () => {
    setShowCreateGalleryModal(false);
  };

  const onGuildChange = (selectedGuild: string) => {
    setGuild(selectedGuild);
    setGuildId(selectedGuild);
  };

  useEffect(() => {
    if (defaultGuild) {
      setGuild(defaultGuild);
      setGuildId(defaultGuild);
    }
  }, [defaultGuild]);

  return (
    <>
      <Flex id={pageSlug} direction="column" height="full" gap="6">
        <Flex id={`${pageSlug}-header`} direction="column" gap="2">
          <Heading size="2xl">{pageTitle}</Heading>
          <p>Welcome to the admin dashboard. Here you can manage the application.</p>
        </Flex>
        <Flex direction="row" gap="4" w="full" align="center">
          <Flex direction="row" w="50%" justify="space-between" align="last baseline" gap="4">
            <GuildSelect w="50%" value={guild} onChange={onGuildChange} />
            <SetDefaultGuildButton defaultGuild={guild} />
          </Flex>
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
              <GalleryCard key={gallery.name} info={gallery} guildId={guild} />
            ))}
          </Flex>
        )}
      </Flex>
      <CreateGalleryModal open={showCreateGalleryModal} closeModal={closeCreateGalleryModal} />
    </>
  );
};

export default AdminDashboard;
