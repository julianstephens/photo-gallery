import { useState } from "react";
import { CreateGalleryForm } from "../forms/CreateGalleryForm";
import { BaseModal, type ModalProps } from "./base";

export interface CreateGalleryModalProps extends ModalProps {
  guildId: string;
}

export const CreateGalleryModal = ({ open, closeModal, guildId }: CreateGalleryModalProps) => {
  const [doSubmit, setDoSubmit] = useState(false);
  return (
    <BaseModal
      open={open}
      closeModal={closeModal}
      title="Create Gallery"
      actionButtonOnClick={() => {
        setDoSubmit(true);
      }}
    >
      <CreateGalleryForm
        guildId={guildId}
        closeModal={closeModal}
        doSubmit={doSubmit}
        setDoSubmit={setDoSubmit}
      />
    </BaseModal>
  );
};
