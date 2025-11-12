import { BaseModal, type ModalProps } from "./base";

export const FilePickerModal = ({ open, closeModal }: ModalProps) => {
  return (
    <BaseModal open={open} closeModal={closeModal} title="Upload Files">
      <div>File Picker Content</div>
    </BaseModal>
  );
};
