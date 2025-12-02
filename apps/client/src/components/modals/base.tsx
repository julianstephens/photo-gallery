import { Button, CloseButton, Dialog, Portal } from "@chakra-ui/react";

export interface BaseModalProps {
  title: string;
  open: boolean;
  closeModal: () => void;
  children: React.ReactNode;
  actionButtonText?: string;
  actionButtonColor?: string;
  actionButtonLoading?: boolean;
  actionButtonOnClick?: () => void;
  withCancelButton?: boolean;
}

export interface ModalProps {
  open: boolean;
  closeModal: () => void;
  actionButtonLoading?: boolean;
  actionButtonOnClick?: () => void;
}

export const BaseModal = ({
  title,
  open,
  closeModal,
  children,
  actionButtonText = "Submit",
  actionButtonColor = "white",
  actionButtonLoading = false,
  actionButtonOnClick,
  withCancelButton = true,
}: BaseModalProps) => {
  return (
    <Dialog.Root
      lazyMount
      closeOnInteractOutside={false}
      open={open}
      onOpenChange={(details) => {
        if (!details.open) closeModal();
      }}
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>{title}</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>{children}</Dialog.Body>
            <Dialog.Footer>
              <Dialog.ActionTrigger asChild>
                <Button variant="outline">Cancel</Button>
              </Dialog.ActionTrigger>
              <Button
                loading={actionButtonLoading}
                colorPalette={actionButtonColor}
                onClick={actionButtonOnClick}
              >
                {actionButtonText}
              </Button>
            </Dialog.Footer>
            <Dialog.CloseTrigger asChild>
              {withCancelButton && <CloseButton size="sm" />}
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
};
