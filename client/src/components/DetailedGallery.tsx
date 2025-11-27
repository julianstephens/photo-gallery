import { Button, Heading, HStack, Icon, Text, VStack } from "@chakra-ui/react";
import { HiOutlineUpload } from "react-icons/hi";
import { HiArrowLongLeft, HiPencil, HiTrash } from "react-icons/hi2";
import { TbCheckbox } from "react-icons/tb";
import type { Gallery } from "utils";
import { Gallery as GalleryDisplay } from "./Gallery";

interface DetailedGalleryProps {
  pageSlug: string;
  gallery: Gallery;
  guildId: string;
  closeGallery?: () => void;
}

export const DetailedGallery = ({
  gallery,
  pageSlug,
  guildId,
  closeGallery,
}: DetailedGalleryProps) => {
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
          <Button colorPalette="blue">
            <Icon>
              <HiOutlineUpload />
            </Icon>
            Upload Photos
          </Button>
          <Button variant="outline">
            <Icon>
              <HiPencil />
            </Icon>
            Edit Name
          </Button>
          <Button variant="subtle" colorPalette="red">
            <Icon>
              <HiTrash />
            </Icon>
            Delete Gallery
          </Button>
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
