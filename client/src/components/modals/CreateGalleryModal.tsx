import { useState } from "react";
import { CreateGalleryForm } from "../forms/CreateGalleryForm";
import { BaseModal, type ModalProps } from "./base";

export const CreateGalleryModal = ({ open, closeModal }: ModalProps) => {
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
      <CreateGalleryForm closeModal={closeModal} doSubmit={doSubmit} setDoSubmit={setDoSubmit} />
    </BaseModal>
  );
};
