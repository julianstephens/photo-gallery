import { GalleryCard } from "@/components/GalleryCard";
import {
  Button,
  Grid,
  GridItem,
  Heading,
  HStack,
  Icon,
  Loader,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { HiOutlineUpload, HiPlus } from "react-icons/hi";
import type { Gallery, UploadJob } from "utils";

interface GalleryListProps {
  data: Gallery[] | undefined;
  error: unknown;
  isLoading: boolean;
  guildId: string | undefined;
  deleteLoading: boolean;
  deleteKey: string | null;
  openConfirmDeleteModal: (galleryName: string) => void;
  handleUploadJobCreated: (jobId: string) => void;
  openCreateGalleryModal: () => void;
  openDetailedGalleryView: (gallery: Gallery) => void;
  uploadJobs: UploadJob[];
  showUploadMonitor: boolean;
  setShowUploadMonitor: (show: boolean) => void;
  activeUploads: number;
  totalJobs: number;
  pageSlug: string;
}

export const GalleryList = ({
  data,
  error,
  isLoading,
  guildId,
  deleteLoading,
  deleteKey,
  openConfirmDeleteModal,
  handleUploadJobCreated,
  openCreateGalleryModal,
  openDetailedGalleryView,
  uploadJobs,
  showUploadMonitor,
  setShowUploadMonitor,
  activeUploads,
  totalJobs,
  pageSlug,
}: GalleryListProps) => {
  return (
    <>
      <HStack
        id={`${pageSlug}-gallery-header`}
        w="full"
        justify="space-between"
        align="center"
        mb="4"
      >
        <VStack align="start" gap="0">
          <Heading size="sm">Photo Galleries</Heading>
          <Text fontSize="sm" color="gray.500">
            {data?.length ?? 0} {data?.length === 1 ? "gallery" : "galleries"} in this guild
          </Text>
        </VStack>
        <Button ms="auto" colorPalette="blue" onClick={openCreateGalleryModal}>
          <Icon size="xs">
            <HiPlus />
          </Icon>{" "}
          Create Gallery
        </Button>
      </HStack>
      {isLoading ? (
        <Loader />
      ) : error || !data ? (
        <Text>Error loading galleries.</Text>
      ) : data.length === 0 ? (
        <Text m="auto">No galleries found for the selected guild.</Text>
      ) : (
        <Grid
          id={`${pageSlug}-gallery-grid`}
          templateColumns="repeat(auto-fill, minmax(500px, 1fr))"
          gap="6"
        >
          {data?.map((gallery) => (
            <GridItem id={`${pageSlug}-gallery-${gallery.name}`} key={gallery.name}>
              <GalleryCard
                key={gallery.name}
                info={gallery}
                guildId={guildId || ""}
                showDeleteLoading={deleteLoading}
                deleteKey={deleteKey}
                openConfirmDeleteModal={() => {
                  openConfirmDeleteModal(gallery.name);
                }}
                openDetailedGalleryView={openDetailedGalleryView}
                onUploadJobCreated={handleUploadJobCreated}
              />
            </GridItem>
          ))}
        </Grid>
      )}
      {!showUploadMonitor && uploadJobs.length > 0 && (
        <Button
          onClick={() => setShowUploadMonitor(true)}
          position="fixed"
          bottom="4"
          right="4"
          bg="blue.600"
          _hover={{ bg: "blue.700" }}
          color="white"
          px="4"
          py="3"
          borderRadius="lg"
          shadow="lg"
          transition="all"
          display="flex"
          alignItems="center"
          gap="2"
          zIndex="40"
        >
          {activeUploads > 0 ? (
            <>
              <Spinner size="sm" />
              <Text>
                {activeUploads} Upload{activeUploads !== 1 ? "s" : ""} in Progress
              </Text>
            </>
          ) : (
            <>
              <Icon size="sm">
                <HiOutlineUpload />
              </Icon>
              <Text>
                {totalJobs} Upload{totalJobs !== 1 ? "s" : ""} Complete
              </Text>
            </>
          )}
        </Button>
      )}
    </>
  );
};
