import { Text } from "@chakra-ui/react";
import { BaseModal, type ModalProps } from "./base";

interface ConfirmDeleteModalProps extends ModalProps {
  itemCount?: number;
}

export const ConfirmDeleteModal = ({
  open,
  closeModal,
  actionButtonLoading,
  actionButtonOnClick,
  itemCount = 1,
}: ConfirmDeleteModalProps) => {
  const itemText = itemCount === 1 ? "item" : "items";
  const message =
    itemCount === 1
      ? "Are you sure you want to delete this item? This action cannot be undone."
      : `Are you sure you want to delete these ${itemCount} ${itemText}? This action cannot be undone.`;

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
      <Text>{message}</Text>
    </BaseModal>
  );
};
