import { uploadToGallery } from "@/queries";
import {
  Button,
  Card,
  FileUpload,
  Flex,
  Icon,
  type FileUploadFileAcceptDetails,
} from "@chakra-ui/react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { HiTrash, HiUpload } from "react-icons/hi";
import type { Gallery } from "utils";
import { toaster } from "./ui/toaster";

export interface GalleryCardProps {
  info: Gallery;
  guildId: string;
  openConfirmDeleteModal?: () => void;
}

export const GalleryCard = ({ info, guildId, openConfirmDeleteModal }: GalleryCardProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const uploadFileMutation = useMutation({
    mutationFn: uploadToGallery,
  });

  const uploadFiles = async (details: FileUploadFileAcceptDetails) => {
    setIsLoading(true);
    const errs = [];
    for (const file of details.files) {
      try {
        await uploadFileMutation.mutateAsync({
          guildId,
          galleryName: info.name,
          file,
        });
      } catch (err) {
        errs.push(err);
        console.error("Error uploading file:", err);
      }
    }
    if (errs.length > 0) {
      toaster.error({
        title: "Upload Error",
        description: `${errs.length} files failed to upload.`,
      });
    } else {
      toaster.success({
        title: "Upload Successful",
        description: "All files uploaded successfully.",
      });
    }
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
          <Flex direction="column" h="full" gap="2">
            <FileUpload.Root
              accept={["application/zip", "application/x-zip-compressed", "image/*"]}
              onFileReject={(details) => {
                console.error("Rejected files:", details.files);
              }}
              onFileAccept={(details) => {
                console.log("Accepted files for upload:", details.files);
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
            <Button
              variant="subtle"
              colorPalette="red"
              loading={isLoading}
              disabled={isLoading}
              onClick={openConfirmDeleteModal}
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
