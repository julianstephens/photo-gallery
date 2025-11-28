import { DeleteGalleryButton } from "@/components/buttons/DeleteGalleryButton";
import { RenameGalleryButton } from "@/components/buttons/RenameGalleryButton";
import { UploadPhotosButton } from "@/components/buttons/UploadPhotosButton";
import { Button, Card, DataList, HStack, Icon, Text, VStack } from "@chakra-ui/react";
import { HiOutlineEye } from "react-icons/hi2";
import type { Gallery } from "utils";

export interface GalleryCardProps {
  info: Gallery;
  guildId: string;
  openDetailedGalleryView: (gallery: Gallery) => void;
}

export const GalleryCard = ({ info, guildId, openDetailedGalleryView }: GalleryCardProps) => {
  return (
    <Card.Root id={`gallery-card-${info.name}`}>
      <Card.Header id={`gallery-card-header-${info.name}`}>
        <Card.Title>{info.name}</Card.Title>
      </Card.Header>
      <Card.Body id={`gallery-card-body-${info.name}`}>
        <VStack align="start" gap={2}>
          <VStack align="start" gap="4" id={`gallery-card-info-${info.name}`}>
            <DataList.Root orientation="horizontal">
              <DataList.Item>
                <DataList.ItemLabel>Created At</DataList.ItemLabel>
                <DataList.ItemValue>
                  {new Date(info.meta.createdAt).toLocaleDateString()}
                </DataList.ItemValue>
              </DataList.Item>
              <DataList.Item>
                <DataList.ItemLabel>Expires In</DataList.ItemLabel>
                <DataList.ItemValue>{info.meta.ttlWeeks} week(s)</DataList.ItemValue>
              </DataList.Item>
              <DataList.Item>
                <DataList.ItemLabel>Created By</DataList.ItemLabel>
                <DataList.ItemValue>{info.meta.createdBy}</DataList.ItemValue>
              </DataList.Item>
            </DataList.Root>
            <Text color="blue.400">{info.meta.totalItems} photos</Text>
          </VStack>
          <HStack id={`gallery-card-actions-${info.name}`} w="full" gap="2" mt="4">
            <Button
              w="45%"
              colorPalette="blue"
              onClick={() => {
                openDetailedGalleryView(info);
              }}
            >
              <Icon>
                <HiOutlineEye />
              </Icon>
              View Gallery
            </Button>
            <UploadPhotosButton
              guildId={guildId}
              galleryName={info.name}
              buttonText="Upload"
              buttonVariant="outline"
              buttonColorPalette="gray"
            />
            <RenameGalleryButton galleryName={info.name} guildId={guildId} type="icon" />
            <DeleteGalleryButton type="icon" guildId={guildId} galleryName={info.name} />
          </HStack>
        </VStack>
      </Card.Body>
    </Card.Root>
  );
};
