import { RenameGalleryModal } from "@/components/modals";
import { Tooltip } from "@/components/ui/tooltip";
import type { ButtonProps } from "@/lib/types";
import { Button, Icon, IconButton } from "@chakra-ui/react";
import { useState } from "react";
import { HiPencil } from "react-icons/hi2";

export const RenameGalleryButton = ({ type, galleryName, guildId }: ButtonProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const openModal = () => {
    setIsModalOpen(true);
  };
  const closeModal = () => {
    setIsModalOpen(false);
  };

  return (
    <>
      {type === "full" ? (
        <Button variant="outline" onClick={openModal} aria-label="Rename Gallery">
          <Icon>
            <HiPencil />
          </Icon>
          Rename Gallery
        </Button>
      ) : (
        <Tooltip content="Rename Gallery">
          <IconButton variant="outline" onClick={openModal} aria-label="Rename Gallery">
            <HiPencil />
          </IconButton>
        </Tooltip>
      )}
      <RenameGalleryModal
        open={isModalOpen}
        closeModal={closeModal}
        guildId={guildId}
        galleryName={galleryName}
      />
    </>
  );
};
