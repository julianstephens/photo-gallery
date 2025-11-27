import { uploadFileInChunks } from "@/services/upload";
import {
  Button,
  Card,
  FileUpload,
  Flex,
  Icon,
  Progress,
  type FileUploadFileAcceptDetails,
} from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { HiTrash, HiUpload } from "react-icons/hi";
import type { Gallery } from "utils";
import { toaster } from "./ui/toaster";

export interface GalleryCardProps {
  info: Gallery;
  openConfirmDeleteModal?: (key: string) => void;
  showDeleteLoading: boolean;
  deleteKey: string | null;
}

export const GalleryCard = ({
  info,
  showDeleteLoading,
  deleteKey,
  openConfirmDeleteModal,
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
      await uploadFileInChunks(file, info.name, (progress) => {
        setUploadProgress(progress);
      });
      toaster.success({
        title: "Upload Completed",
        description: "File uploaded successfully.",
      });
    } catch (error) {
      toaster.error({
        title: "Upload Failed",
        description: "An error occurred during the upload.",
      });
      console.error(error);
    } finally {
      setIsLoading(false);
      setUploadProgress(null);
    }
  };

  return (
    <Card.Root>
      <Card.Header>
        <Card.Title>{info.name}</Card.Title>
      </Card.Header>
      <Card.Body>
        <Flex direction="row" justify="space-between" align="center" gap={2}>
          <Flex h="full" direction="column" gap={2}>
            <p>Created At: {new Date(info.meta.createdAt).toLocaleDateString()}</p>
            <p>Expires In: {info.meta.ttlWeeks} week(s)</p>
            <p>Created By: {info.meta.createdBy}</p>
          </Flex>
          <Flex direction="column" h="full" gap="2">
            {isLoading && uploadProgress !== null && (
              <Progress.Root value={uploadProgress} size="sm" striped animated>
                <Progress.Track>
                  <Progress.Range />
                </Progress.Track>
              </Progress.Root>
            )}
            <FileUpload.Root
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
                  <HiUpload />
                  Upload
                </Button>
              </FileUpload.Trigger>
            </FileUpload.Root>
            <Button
              variant="subtle"
              colorPalette="red"
              loading={deleteLoading && deleteKey === info.name}
              disabled={(deleteLoading && deleteKey !== info.name) || isLoading}
              onClick={openModalWithLoading}
            >
              <Icon>
                <HiTrash />
              </Icon>
              Delete gallery
            </Button>
          </Flex>
        </Flex>
      </Card.Body>
    </Card.Root>
  );
};
