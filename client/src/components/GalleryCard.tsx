import { getUploadJob, uploadToGallery } from "@/queries";
import {
  Button,
  Card,
  FileUpload,
  Flex,
  Icon,
  Text,
  type FileUploadFileAcceptDetails,
} from "@chakra-ui/react";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { HiTrash, HiUpload } from "react-icons/hi";
import type { Gallery, UploadJob } from "utils";
import { toaster } from "./ui/toaster";

export interface GalleryCardProps {
  info: Gallery;
  guildId: string;
  openConfirmDeleteModal?: () => void;
}

export const GalleryCard = ({ info, guildId, openConfirmDeleteModal }: GalleryCardProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    jobId: string;
    status: string;
    progress?: { processedFiles: number; totalFiles: number };
  } | null>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const uploadFileMutation = useMutation({
    mutationFn: uploadToGallery,
  });

  const pollUploadJob = async (jobId: string) => {
    try {
      const job = (await getUploadJob(jobId)) as UploadJob;
      setUploadProgress({
        jobId,
        status: job.status,
        progress: job.progress,
      });

      if (job.status === "completed") {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        setIsLoading(false);
        toaster.success({
          title: "Upload Completed",
          description: `Successfully uploaded ${job.progress?.uploadedFiles.length ?? 0} files.`,
        });
        setUploadProgress(null);
      } else if (job.status === "failed") {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        setIsLoading(false);
        toaster.error({
          title: "Upload Failed",
          description: job.error || "Upload failed",
        });
        setUploadProgress(null);
      }
    } catch (err) {
      console.error("Error polling upload job:", err);
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      setIsLoading(false);
      setUploadProgress(null);
    }
  };

  const uploadFiles = async (details: FileUploadFileAcceptDetails) => {
    setIsLoading(true);
    const errs = [];
    for (const file of details.files) {
      try {
        const result = await uploadFileMutation.mutateAsync({
          guildId,
          galleryName: info.name,
          file,
        });

        // Handle async uploads (ZIP files)
        if (result.type === "async" && result.jobId) {
          toaster.info({
            title: "Processing Upload",
            description: "Your ZIP file is being processed. Please wait...",
          });

          // Start polling for job status
          pollingIntervalRef.current = setInterval(() => {
            void pollUploadJob(result.jobId!);
          }, 2000); // Poll every 2 seconds

          // Initial poll
          void pollUploadJob(result.jobId);
        } else {
          // Sync upload (single image)
          toaster.success({
            title: "Upload Successful",
            description: "File uploaded successfully.",
          });
          setIsLoading(false);
        }
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
      setIsLoading(false);
    }
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

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
            {uploadProgress && (
              <Flex direction="column" gap={1} w="full" p={2} bg="gray.50" borderRadius="md">
                <Text fontSize="sm" fontWeight="medium">
                  {uploadProgress.status === "processing"
                    ? "Processing..."
                    : uploadProgress.status === "pending"
                      ? "Starting upload..."
                      : uploadProgress.status}
                </Text>
                {uploadProgress.progress && (
                  <Text fontSize="xs" color="gray.600">
                    {uploadProgress.progress.processedFiles} / {uploadProgress.progress.totalFiles}{" "}
                    files processed
                  </Text>
                )}
              </Flex>
            )}
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
