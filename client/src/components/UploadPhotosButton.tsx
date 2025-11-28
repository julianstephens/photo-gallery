import { useUploadContext } from "@/contexts/UploadContext";
import { uploadProgressStore } from "@/lib/upload/uploadProgressStore";
import { uploadFileInChunks } from "@/lib/upload/uploadService";
import { Button, FileUpload, type FileUploadFileAcceptDetails } from "@chakra-ui/react";
import { useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { useRef, useState } from "react";
import { HiOutlineUpload } from "react-icons/hi";
import { toaster } from "./ui/toaster";

interface UploadPhotosButtonProps {
  guildId: string;
  galleryName: string;
  buttonText?: string;
  buttonVariant: "outline" | "solid" | "ghost" | "plain";
  buttonColorPalette: "gray" | "red" | "blue" | "green" | "yellow" | "purple" | "pink" | "orange";
}

export const UploadPhotosButton = ({
  guildId,
  galleryName,
  buttonText = "Upload",
  buttonVariant = "outline",
  buttonColorPalette = "gray",
}: UploadPhotosButtonProps) => {
  const queryClient = useQueryClient();
  const { updateUploadMonitorVisibility, setHasActiveUploads } = useUploadContext();
  const [isLoading, setIsLoading] = useState(false);
  const [, setUploadProgress] = useState<number | null>(null);
  const fileUploadRef = useRef<HTMLInputElement>(null);

  const uploadFiles = async (details: FileUploadFileAcceptDetails) => {
    setIsLoading(true);
    setUploadProgress(0);
    const file = details.files[0];
    const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    if (!guildId) {
      toaster.error({
        title: "Upload Failed",
        description: "Guild information is missing",
      });
      setIsLoading(false);
      return;
    }

    try {
      setHasActiveUploads(true);
      // Register upload in progress store
      uploadProgressStore.addUpload(uploadId, file.name, galleryName, guildId);

      await uploadFileInChunks(file, galleryName, guildId, (progress) => {
        setUploadProgress(progress);
        uploadProgressStore.updateProgress(uploadId, progress);
        updateUploadMonitorVisibility(true);
      });

      uploadProgressStore.completeUpload(uploadId);

      toaster.success({
        title: "Upload Completed",
        description: "File uploaded successfully.",
      });

      // Refetch gallery list to update totalItems count
      if (guildId) {
        // Refetch the galleries list to get updated metadata
        await queryClient.refetchQueries({
          queryKey: ["galleries", { guildId }],
          type: "active",
        });
        // Also refetch gallery items
        await queryClient.refetchQueries({
          queryKey: ["galleryItems"],
          type: "active",
        });
      }
    } catch (error) {
      let errMsg = "An error occurred during the upload.";
      if (error instanceof AxiosError) {
        errMsg = error.response?.data?.error || errMsg;
      }
      uploadProgressStore.failUpload(uploadId, errMsg);
      toaster.error({
        title: "Upload Failed",
        description: errMsg,
      });
      console.error(error);
    } finally {
      setIsLoading(false);
      setUploadProgress(null);
      setHasActiveUploads(false);
      if (fileUploadRef.current) {
        fileUploadRef.current.value = "";
      }
    }
  };
  return (
    <FileUpload.Root
      w="45%"
      accept={["image/*"]}
      onFileReject={(details) => {
        console.error("Rejected files:", details.files);
      }}
      onFileAccept={(details) => {
        void uploadFiles(details);
      }}
    >
      <FileUpload.HiddenInput ref={fileUploadRef} />
      <FileUpload.Trigger asChild>
        <Button
          variant={buttonVariant}
          colorPalette={buttonColorPalette}
          w="full"
          loading={isLoading}
          disabled={isLoading}
        >
          <HiOutlineUpload />
          {buttonText}
        </Button>
      </FileUpload.Trigger>
    </FileUpload.Root>
  );
};
