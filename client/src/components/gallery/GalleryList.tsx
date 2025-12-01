import { Loader } from "@/components/Loader";
import { Box, Button, Flex, Grid, GridItem, Heading, Text, VStack } from "@chakra-ui/react";
import { HiPlus } from "react-icons/hi";
import type { Gallery } from "utils";
import { GalleryCard } from "./GalleryCard";

interface GalleryListProps {
  data: Gallery[] | undefined;
  error: unknown;
  isLoading: boolean;
  guildId: string | undefined;
  openCreateGalleryModal: () => void;
  openDetailedGalleryView: (gallery: Gallery) => void;
  componentIdentifier: string;
}

export const GalleryList = ({
  data,
  error,
  isLoading,
  guildId,
  openCreateGalleryModal,
  openDetailedGalleryView,
  componentIdentifier,
}: GalleryListProps) => {
  const identifierPrefix = `${componentIdentifier}-gallery-list`;
  return (
    <Box id={`${identifierPrefix}-container`} w="full" h="full">
      <Flex
        id={`${identifierPrefix}-gallery-header`}
        w="full"
        justify="space-between"
        align="center"
        mb="4"
      >
        <VStack id={`${identifierPrefix}-header-info`} align="start" gap="0">
          <Heading size="sm">Photo Galleries</Heading>
          <Text fontSize="sm" color="gray.500">
            {data?.length ?? 0} {data?.length === 1 ? "gallery" : "galleries"} in this guild
          </Text>
        </VStack>
        <Button ms="auto" colorPalette="blue" onClick={openCreateGalleryModal}>
          <HiPlus />
          Create Gallery
        </Button>
      </Flex>
      {isLoading ? (
        <Loader />
      ) : error || !data ? (
        <Flex w="full" h="full" justify="center" align="center">
          <Text>Error loading galleries.</Text>
        </Flex>
      ) : data.length === 0 ? (
        <Flex w="full" h="full" justify="center" align="center">
          <Text>No galleries found for the selected guild.</Text>
        </Flex>
      ) : (
        <Grid
          id={`${identifierPrefix}-gallery-grid`}
          templateColumns="repeat(auto-fill, minmax(500px, 1fr))"
          gap="6"
        >
          {data?.map((gallery) => (
            <GridItem id={`${identifierPrefix}-gallery-${gallery.name}`} key={gallery.name}>
              <GalleryCard
                key={gallery.name}
                info={gallery}
                guildId={guildId || ""}
                openDetailedGalleryView={openDetailedGalleryView}
              />
            </GridItem>
          ))}
        </Grid>
      )}
    </Box>
  );
};
