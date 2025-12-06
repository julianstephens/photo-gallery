import { queryClient } from "@/clients";
import { ConfirmDeleteModal } from "@/components/modals";
import { toaster } from "@/components/ui/toaster";
import { Tooltip } from "@/components/ui/tooltip";
import { useGalleryContext } from "@/hooks";
import { logger } from "@/lib/logger";
import type { ButtonProps } from "@/lib/types";
import { removeGallery } from "@/queries";
import { Button, Icon, IconButton } from "@chakra-ui/react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { HiTrash } from "react-icons/hi2";

interface DeleteGalleryButtonProps extends ButtonProps {
  postDelete?: () => void;
}

export const DeleteGalleryButton = ({
  type,
  guildId,
  galleryName,
  postDelete,
}: DeleteGalleryButtonProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { removeGallery: removeGalleryFromContext } = useGalleryContext();

  const deleteGalleryMutation = useMutation({
    mutationFn: removeGallery,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["galleries", { guildId }] });
    },
  });

  const openModal = () => {
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const deleteGallery = async () => {
    if (!guildId || !galleryName) {
      toaster.error({
        title: "Deletion Error",
        description: "Guild ID or Gallery Name is missing.",
      });
      return;
    }

    try {
      setLoading(true);
      await deleteGalleryMutation.mutateAsync({
        guildId: guildId ?? "",
        galleryName: galleryName,
      });
      // Update context to remove the gallery
      removeGalleryFromContext(galleryName);
      toaster.success({
        title: "Gallery Deleted",
        description: `Gallery "${galleryName}" has been deleted.`,
      });
    } catch (err) {
      logger.error({ error: err }, "Error deleting gallery");
      toaster.error({
        title: "Deletion Error",
        description: `Failed to delete gallery "${galleryName}".`,
      });
    } finally {
      postDelete?.();
      setLoading(false);
    }
  };

  return (
    <>
      {type === "full" ? (
        <Button variant="subtle" colorPalette="red" loading={loading} onClick={openModal}>
          <Icon>
            <HiTrash />
          </Icon>
          Delete Gallery
        </Button>
      ) : (
        <Tooltip content="Delete Gallery">
          <IconButton
            variant="subtle"
            colorPalette="red"
            loading={loading}
            onClick={openModal}
            aria-label="Delete Gallery"
          >
            <HiTrash />
          </IconButton>
        </Tooltip>
      )}
      <ConfirmDeleteModal
        open={isModalOpen}
        closeModal={closeModal}
        actionButtonLoading={loading}
        actionButtonOnClick={deleteGallery}
      />
    </>
  );
};
