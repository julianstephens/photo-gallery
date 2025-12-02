import { Text } from "@chakra-ui/react";
import { BaseModal, type ModalProps } from "./base";

export const ConfirmDeleteModal = ({
  open,
  closeModal,
  actionButtonLoading,
  actionButtonOnClick,
}: ModalProps) => {
  return (
    <BaseModal
      open={open}
      closeModal={closeModal}
      title="Confirm Deletion"
      actionButtonText="Delete"
      actionButtonColor="red"
      actionButtonLoading={actionButtonLoading}
      actionButtonOnClick={() => {
        if (actionButtonOnClick) {
          void actionButtonOnClick();
          closeModal();
        }
      }}
    >
      <Text>Are you sure you want to delete this item? This action cannot be undone.</Text>
    </BaseModal>
  );
};
