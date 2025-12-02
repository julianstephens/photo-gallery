import { CreateGalleryForm } from "@/components/forms";
import { useState } from "react";
import { BaseModal, type ModalProps } from "./base";

export interface CreateGalleryModalProps extends ModalProps {
  guildId: string;
}

export const CreateGalleryModal = ({ open, closeModal, guildId }: CreateGalleryModalProps) => {
  const [doSubmit, setDoSubmit] = useState(false);
  const [loading, setLoading] = useState(false);
  return (
    <BaseModal
      open={open}
      closeModal={closeModal}
      title="Create Gallery"
      actionButtonOnClick={() => {
        setDoSubmit(true);
      }}
      actionButtonLoading={loading}
    >
      <CreateGalleryForm
        guildId={guildId}
        closeModal={closeModal}
        doSubmit={doSubmit}
        setDoSubmit={setDoSubmit}
        setLoading={setLoading}
      />
    </BaseModal>
  );
};
