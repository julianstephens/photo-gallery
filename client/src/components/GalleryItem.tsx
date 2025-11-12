import { Button, Card, FileUpload, Flex, type FileUploadFileAcceptDetails } from "@chakra-ui/react";
import { useState } from "react";
import { HiUpload } from "react-icons/hi";
import type { Gallery } from "utils";

export interface GalleryItemProps {
  info: Gallery;
  openFilePickerModal?: () => void;
}

export const GalleryItem = ({ info }: GalleryItemProps) => {
  const [isLoading, setIsLoading] = useState(false);

  const uploadFiles = async (details: FileUploadFileAcceptDetails) => {
    setIsLoading(true);
    // TODO: Implement actual file upload logic here
    console.log("Uploading files to gallery:", info.name, details.files);
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Simulate async upload
    setIsLoading(false);
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
          <Flex h="full">
            <FileUpload.Root
              accept={["application/zip", "image/*"]}
              onFileAccept={(details) => {
                void uploadFiles(details);
              }}
            >
              <FileUpload.HiddenInput />
              <FileUpload.Trigger asChild>
                <Button variant="outline" loading={isLoading} disabled={isLoading}>
                  <HiUpload />
                  Upload images
                </Button>
              </FileUpload.Trigger>
            </FileUpload.Root>
          </Flex>
        </Flex>
      </Card.Body>
    </Card.Root>
  );
};
