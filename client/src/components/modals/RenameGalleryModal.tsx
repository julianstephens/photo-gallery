import { RenameGalleryForm } from "@/components/forms/RenameGalleryForm";
import { useState } from "react";
import { BaseModal } from "./base";

export const RenameGalleryModal = ({
  open,
  closeModal,
  guildId,
  galleryName,
}: {
  open: boolean;
  closeModal: () => void;
  guildId: string;
  galleryName: string;
}) => {
  const [loading, setLoading] = useState(false);
  const [doSubmit, setDoSubmit] = useState(false);
  return (
    <BaseModal
      title="Rename Gallery"
      open={open}
      closeModal={closeModal}
      actionButtonOnClick={() => {
        setDoSubmit(true);
      }}
      actionButtonLoading={loading}
    >
      <RenameGalleryForm
        guildId={guildId}
        galleryName={galleryName}
        closeModal={closeModal}
        setLoading={setLoading}
        doSubmit={doSubmit}
        setDoSubmit={setDoSubmit}
      />
    </BaseModal>
  );
};
