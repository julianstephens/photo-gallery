import { queryClient } from "@/clients";
import { GuildSelect } from "@/components/forms/Fields";
import { GalleryCard } from "@/components/GalleryCard";
import { ConfirmDeleteModal } from "@/components/modals/ConfirmDelete";
import { CreateGalleryModal } from "@/components/modals/CreateGalleryModal";
import { SetDefaultGuildButton } from "@/components/SetDefaultGuild";
import { toaster } from "@/components/ui/toaster";
import { useDefaultGuild, useListGalleries } from "@/hooks";
import { removeGallery } from "@/queries";
import { Button, Flex, Heading, Loader, Text } from "@chakra-ui/react";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";

const AdminDashboard = () => {
  const [guildId, setGuildId] = useState<string | undefined>(undefined);
  const { data, error, isLoading } = useListGalleries(guildId);
  const defaultGuild = useDefaultGuild();
  const [showCreateGalleryModal, setShowCreateGalleryModal] = useState(false);
  const [showConfirmDeleteModal, setShowConfirmDeleteModal] = useState(false);
  const [deleteKey, setDeleteKey] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [guild, setGuild] = useState<string>("");

  const pageTitle = "Admin Dashboard";
  const pageSlug = pageTitle.toLowerCase().replace(/\s+/g, "-").toLowerCase();

  const deleteGalleryMutation = useMutation({
    mutationFn: removeGallery,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["galleries", { guildId }] });
    },
  });

  const openCreateGalleryModal = () => {
    setShowCreateGalleryModal(true);
  };

  const closeCreateGalleryModal = () => {
    setShowCreateGalleryModal(false);
  };

  const openConfirmDeleteModal = (gallery: string) => {
    setDeleteKey(gallery);
    setShowConfirmDeleteModal(true);
  };

  const closeConfirmDeleteModal = () => {
    setShowConfirmDeleteModal(false);
  };

  const deleteGallery = async () => {
    if (!guildId || !deleteKey) {
      toaster.error({
        title: "Deletion Error",
        description: "Guild ID or Gallery Name is missing.",
      });
      return;
    }

    try {
      setDeleteLoading(true);
      await deleteGalleryMutation.mutateAsync({
        guildId: guildId ?? "",
        galleryName: deleteKey ?? "",
      });
      toaster.success({
        title: "Gallery Deleted",
        description: `Gallery "${deleteKey}" has been deleted.`,
      });
    } catch (err) {
      console.error("Error deleting gallery:", err);
      toaster.error({
        title: "Deletion Error",
        description: `Failed to delete gallery "${deleteKey}".`,
      });
    } finally {
      setDeleteLoading(false);
    }
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
          <Text m="auto">No galleries found for the selected guild.</Text>
        ) : (
          <Flex direction="column" gap="4" w="full">
            {data?.map((gallery) => (
              <GalleryCard
                key={gallery.name}
                info={gallery}
                showDeleteLoading={deleteLoading}
                deleteKey={deleteKey}
                openConfirmDeleteModal={() => {
                  openConfirmDeleteModal(gallery.name);
                }}
              />
            ))}
          </Flex>
        )}
      </Flex>
      <CreateGalleryModal
        guildId={guildId ?? ""}
        open={showCreateGalleryModal}
        closeModal={closeCreateGalleryModal}
      />
      <ConfirmDeleteModal
        open={showConfirmDeleteModal}
        closeModal={closeConfirmDeleteModal}
        actionButtonOnClick={deleteGallery}
      />
    </>
  );
};

export default AdminDashboard;
