import { uploadToGallery } from "@/queries";
import { Button, Card, FileUpload, Flex, type FileUploadFileAcceptDetails } from "@chakra-ui/react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { HiUpload } from "react-icons/hi";
import type { Gallery } from "utils";
import { toaster } from "./ui/toaster";

export interface GalleryCardProps {
  info: Gallery;
  guildId: string;
}

export const GalleryCard = ({ info, guildId }: GalleryCardProps) => {
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
