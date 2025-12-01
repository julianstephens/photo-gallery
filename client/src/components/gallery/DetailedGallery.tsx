import { DeleteGalleryButton, RenameGalleryButton, UploadPhotosButton } from "@/components/buttons";
import { ConfirmDeleteModal } from "@/components/modals";
import { toaster } from "@/components/ui/toaster";
import { useListGalleryItems } from "@/hooks";
import { logger } from "@/lib/logger";
import { getGallery, removeGalleryItems } from "@/queries";
import { Button, Heading, HStack, Icon, Spinner, Text, VStack } from "@chakra-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { HiArrowLongLeft, HiTrash, HiXMark } from "react-icons/hi2";
import { TbCheckbox, TbSquare, TbSquareCheck } from "react-icons/tb";
import { Gallery as GalleryDisplay } from "./Gallery";

interface DetailedGalleryProps {
  pageSlug: string;
  galleryName: string;
  guildId: string;
  closeGallery: () => void;
}

export const DetailedGallery = ({
  galleryName,
  pageSlug,
  guildId,
  closeGallery,
}: DetailedGalleryProps) => {
  const queryClient = useQueryClient();
  const [selectMode, setSelectMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: gallery, isLoading } = useQuery({
    queryKey: ["gallery", { guildId, galleryName }],
    queryFn: () => getGallery(guildId, galleryName),
    enabled: !!guildId && !!galleryName,
  });

  const { data: galleryItems } = useListGalleryItems(guildId, galleryName);

  const deleteItemsMutation = useMutation({
    mutationFn: removeGalleryItems,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["galleryItems", { guildId, galleryName }] });
      await queryClient.invalidateQueries({ queryKey: ["gallery", { guildId, galleryName }] });
    },
  });

  const handleToggleSelect = useCallback((itemName: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemName)) {
        next.delete(itemName);
      } else {
        next.add(itemName);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (galleryItems?.contents) {
      setSelectedItems(new Set(galleryItems.contents.map((item) => item.name)));
    }
  }, [galleryItems]);

  const handleDeselectAll = useCallback(() => {
    setSelectedItems(new Set());
  }, []);

  const handleCancelSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedItems(new Set());
  }, []);

  const handleEnterSelectMode = useCallback(() => {
    setSelectMode(true);
  }, []);

  const handleDeleteSelected = async () => {
    if (selectedItems.size === 0) return;

    try {
      setIsDeleting(true);
      const result = await deleteItemsMutation.mutateAsync({
        guildId,
        galleryName,
        itemNames: Array.from(selectedItems),
      });

      if (result.deletedCount > 0) {
        toaster.success({
          title: "Photos Deleted",
          description: `Successfully deleted ${result.deletedCount} photo(s).`,
        });
      }

      if (result.failedCount > 0) {
        toaster.error({
          title: "Some Deletions Failed",
          description: `Failed to delete ${result.failedCount} photo(s).`,
        });
      }

      // Exit select mode and clear selections
      setSelectMode(false);
      setSelectedItems(new Set());
      setIsDeleteModalOpen(false);
    } catch (err) {
      logger.error({ error: err }, "Error deleting gallery items");
      toaster.error({
        title: "Deletion Error",
        description: "Failed to delete selected photos.",
      });
      // Keep modal open on error so user can retry or cancel
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <VStack justify="center" align="center" height="full">
        <Spinner />
      </VStack>
    );
  }

  if (!gallery) {
    return (
      <VStack justify="center" align="center" height="full" gap="4">
        <Text>Gallery not found</Text>
        <Button onClick={closeGallery}>Back to galleries</Button>
      </VStack>
    );
  }

  return (
    <>
      <HStack
        id={`${pageSlug}-detailed-gallery-header`}
        w="full"
        justify="space-between"
        align="center"
      >
        <VStack align="start" gap="0.5">
          <Button
            alignContent="start"
            variant="plain"
            onClick={selectMode ? handleCancelSelectMode : closeGallery}
            color="gray.400"
            pl="0"
            _hover={{ color: "white", transition: "color 0.2s" }}
          >
            <HiArrowLongLeft /> {selectMode ? "Exit select mode" : "Back to galleries"}
          </Button>
          <VStack align="start" gap="0.5">
            <Heading size="xs">{gallery.name}</Heading>
            <Text fontSize="sm" color="gray.500">
              Created: {new Date(gallery.meta.createdAt).toLocaleDateString()}
            </Text>
            <Text fontSize="sm" color="gray.500">
              Expires: {gallery.meta.ttlWeeks} week(s)
            </Text>
            <Text fontSize="sm" color="gray.500">
              {gallery.meta.totalItems} photos
              {selectMode && selectedItems.size > 0 && ` (${selectedItems.size} selected)`}
            </Text>
          </VStack>
        </VStack>
        <HStack gap="2">
          {selectMode ? (
            <>
              <Button variant="outline" onClick={handleSelectAll}>
                <Icon>
                  <TbSquareCheck />
                </Icon>
                Select All
              </Button>
              <Button variant="outline" onClick={handleDeselectAll}>
                <Icon>
                  <TbSquare />
                </Icon>
                Deselect All
              </Button>
              <Button
                variant="solid"
                colorPalette="red"
                disabled={selectedItems.size === 0}
                loading={isDeleting}
                onClick={() => setIsDeleteModalOpen(true)}
              >
                <Icon>
                  <HiTrash />
                </Icon>
                Delete ({selectedItems.size})
              </Button>
              <Button variant="outline" onClick={handleCancelSelectMode}>
                <Icon>
                  <HiXMark />
                </Icon>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={handleEnterSelectMode}>
                <Icon>
                  <TbCheckbox />
                </Icon>
                Select Photos
              </Button>
              <RenameGalleryButton galleryName={gallery.name} guildId={guildId} type="full" />
              <UploadPhotosButton
                guildId={guildId}
                galleryName={gallery.name}
                buttonText="Upload Photos"
                buttonColorPalette="blue"
                buttonVariant="solid"
              />
              <DeleteGalleryButton
                galleryName={gallery.name}
                guildId={guildId}
                type="full"
                postDelete={closeGallery}
              />
            </>
          )}
        </HStack>
      </HStack>
      <GalleryDisplay
        guildId={guildId}
        galleryName={gallery.name}
        columnCount={5}
        includeHeader={false}
        selectMode={selectMode}
        selectedItems={selectedItems}
        onToggleSelect={handleToggleSelect}
      />
      <ConfirmDeleteModal
        open={isDeleteModalOpen}
        closeModal={() => setIsDeleteModalOpen(false)}
        actionButtonLoading={isDeleting}
        actionButtonOnClick={handleDeleteSelected}
      />
    </>
  );
};
