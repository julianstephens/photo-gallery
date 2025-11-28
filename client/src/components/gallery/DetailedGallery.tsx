import { DeleteGalleryButton } from "@/components/buttons/DeleteGalleryButton";
import { RenameGalleryButton } from "@/components/buttons/RenameGalleryButton";
import { UploadPhotosButton } from "@/components/buttons/UploadPhotosButton";
import { getGallery } from "@/queries";
import { Button, Heading, HStack, Icon, Spinner, Text, VStack } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { HiArrowLongLeft } from "react-icons/hi2";
import { TbCheckbox } from "react-icons/tb";
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
  const { data: gallery, isLoading } = useQuery({
    queryKey: ["gallery", { guildId, galleryName }],
    queryFn: () => getGallery(guildId, galleryName),
    enabled: !!guildId && !!galleryName,
  });

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
            onClick={closeGallery}
            color="gray.400"
            pl="0"
            _hover={{ color: "white", transition: "color 0.2s" }}
          >
            <HiArrowLongLeft /> Back to galleries
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
            </Text>
          </VStack>
        </VStack>
        <HStack gap="2">
          <Button variant="outline">
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
        </HStack>
      </HStack>
      <GalleryDisplay
        guildId={guildId}
        galleryName={gallery.name}
        columnCount={5}
        includeHeader={false}
      />
    </>
  );
};
