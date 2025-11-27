import { uploadToGallery } from "@/lib/upload/uploadService";
import {
  Button,
  Card,
  DataList,
  FileUpload,
  HStack,
  Icon,
  IconButton,
  Progress,
  Text,
  VStack,
  type FileUploadFileAcceptDetails,
} from "@chakra-ui/react";
import { AxiosError } from "axios";
import { useEffect, useState } from "react";
import { HiOutlineUpload, HiTrash } from "react-icons/hi";
import { HiOutlineEye, HiPencil } from "react-icons/hi2";
import type { Gallery } from "utils";
import { toaster } from "./ui/toaster";

export interface GalleryCardProps {
  info: Gallery;
  guildId: string;
  openConfirmDeleteModal?: (key: string) => void;
  showDeleteLoading: boolean;
  deleteKey: string | null;
  onUploadJobCreated?: (jobId: string) => void;
  openDetailedGalleryView: (gallery: Gallery) => void;
}

export const GalleryCard = ({
  info,
  guildId,
  showDeleteLoading,
  deleteKey,
  openConfirmDeleteModal,
  onUploadJobCreated,
  openDetailedGalleryView,
}: GalleryCardProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(showDeleteLoading);

  useEffect(() => {
    setDeleteLoading(showDeleteLoading);
  }, [showDeleteLoading]);

  const openModalWithLoading = async () => {
    openConfirmDeleteModal?.(info.name);
  };

  const uploadFiles = async (details: FileUploadFileAcceptDetails) => {
    setIsLoading(true);
    setUploadProgress(0);
    const file = details.files[0];

    try {
      const result = await uploadToGallery(file, info.name, guildId);

      if (result.type === "async" && result.jobId) {
        // Async upload - job created
        onUploadJobCreated?.(result.jobId);
        toaster.success({
          title: "Upload Started",
          description: "Your ZIP file is being processed. Check the upload monitor for progress.",
        });
      } else {
        // Sync upload - completed immediately
        toaster.success({
          title: "Upload Completed",
          description: "File uploaded successfully.",
        });
      }
    } catch (error) {
      let errMsg = "An error occurred during the upload.";
      if (error instanceof AxiosError) {
        errMsg = error.response?.data?.error || errMsg;
      }
      toaster.error({
        title: "Upload Failed",
        description: errMsg,
      });
      console.error(error);
    } finally {
      setIsLoading(false);
      setUploadProgress(null);
    }
  };

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
            {isLoading && uploadProgress !== null && (
              <Progress.Root value={uploadProgress} size="sm" striped animated>
                <Progress.Track>
                  <Progress.Range />
                </Progress.Track>
              </Progress.Root>
            )}
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
            <FileUpload.Root
              w="45%"
              accept={["application/zip", "application/x-zip-compressed", "image/*"]}
              onFileReject={(details) => {
                console.error("Rejected files:", details.files);
              }}
              onFileAccept={(details) => {
                void uploadFiles(details);
              }}
            >
              <FileUpload.HiddenInput />
              <FileUpload.Trigger asChild>
                <Button
                  variant="outline"
                  w="full"
                  loading={isLoading}
                  disabled={isLoading || deleteLoading}
                >
                  <HiOutlineUpload />
                  Upload
                </Button>
              </FileUpload.Trigger>
            </FileUpload.Root>
            <IconButton variant="outline">
              <HiPencil />
            </IconButton>
            <IconButton
              variant="subtle"
              colorPalette="red"
              loading={deleteLoading && deleteKey === info.name}
              disabled={(deleteLoading && deleteKey !== info.name) || isLoading}
              onClick={openModalWithLoading}
            >
              <HiTrash />
            </IconButton>
          </HStack>
        </VStack>
      </Card.Body>
    </Card.Root>
  );
};
