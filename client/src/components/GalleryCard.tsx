import { useUploadJobWorker } from "@/hooks/useUploadJobWorker";
import { uploadToGallery } from "@/queries";
import { uploadJobStore } from "@/uploadJobStore";
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
import { useEffect, useState } from "react";
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
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    jobId: string;
    status: string;
    progress?: { processedFiles: number; totalFiles: number };
  } | null>(null);

  const { start, stop, state: workerState } = useUploadJobWorker();

  const uploadFileMutation = useMutation({ mutationFn: uploadToGallery });

  const openModalWithLoading = async () => {
    setDeleteLoading(true);
    openConfirmDeleteModal?.();
    setDeleteLoading(false);
  };

  // Sync worker state into component state for display + side effects.
  useEffect(() => {
    if (!workerState) return;
    console.log("[GalleryCard] Worker state changed", workerState);
    if (workerState.status === "running" && workerState.job) {
      setUploadProgress({
        jobId: workerState.job.id,
        status: workerState.job.status,
        progress: workerState.job.progress,
      });
    }

    if (workerState.status === "completed" && workerState.job) {
      setIsLoading(false);
      toaster.success({
        title: "Upload Completed",
        description: "Upload completed.",
      });
      setUploadProgress(null);
    }

    if (workerState.status === "failed") {
      setIsLoading(false);
      toaster.error({ title: "Upload Failed", description: workerState.error || "Upload failed" });
      setUploadProgress(null);
    }

    if (workerState.status === "timeout") {
      setIsLoading(false);
      toaster.error({
        title: "Upload Timeout",
        description: "Upload processing took too long and was cancelled.",
      });
      setUploadProgress(null);
    }

    if (workerState.status === "not_found") {
      setIsLoading(false);
      toaster.error({
        title: "Upload Job Not Found",
        description: "The upload job could not be found. It may have expired or been deleted.",
      });
      setUploadProgress(null);
    }
  }, [workerState]);

  // On mount, reattach to any active upload job for this gallery
  useEffect(() => {
    const key = uploadJobStore.makeKey(guildId, info.name);
    const existingJobId = uploadJobStore.getActiveJob(key);
    if (existingJobId) {
      console.log("[GalleryCard] Reattaching to existing upload job", {
        guildId,
        galleryName: info.name,
        jobId: existingJobId,
      });
      setIsLoading(true);
      start(existingJobId);
    }
  }, [guildId, info.name, start]);

  const uploadFiles = async (details: FileUploadFileAcceptDetails) => {
    setIsLoading(true);
    const errs: unknown[] = [];
    let hasAsyncUpload = false;

    const zipFiles = details.files.filter(
      (f) =>
        f.name.toLowerCase().endsWith(".zip") ||
        f.type === "application/zip" ||
        f.type === "application/x-zip-compressed",
    );
    const imageFiles = details.files.filter((f) => !zipFiles.includes(f));

    if (zipFiles.length > 1) {
      toaster.error({
        title: "Multiple ZIP Files",
        description: "Please upload only one ZIP file at a time.",
      });
      setIsLoading(false);
      return;
    }

    if (zipFiles.length > 0 && imageFiles.length > 0) {
      toaster.error({
        title: "Mixed File Types",
        description: "Upload either image files OR a ZIP, not both.",
      });
      setIsLoading(false);
      return;
    }

    // Upload images (synchronous)
    for (const file of imageFiles) {
      try {
        const result = await uploadFileMutation.mutateAsync({
          guildId,
          galleryName: info.name,
          file,
        });
        if (result.type === "sync") {
          toaster.success({ title: "Upload Successful", description: `${file.name} uploaded.` });
        }
      } catch (err) {
        errs.push(err);
        console.error("Error uploading file:", err);
      }
    }

    // Upload ZIP (async)
    if (zipFiles.length === 1) {
      const zipFile = zipFiles[0];
      try {
        console.log("[GalleryCard] Starting ZIP upload", {
          guildId,
          galleryName: info.name,
          filename: zipFile.name,
          size: zipFile.size,
        });
        const result = await uploadFileMutation.mutateAsync({
          guildId,
          galleryName: info.name,
          file: zipFile,
        });
        if (result.type === "async" && result.jobId) {
          hasAsyncUpload = true;
          console.log("[GalleryCard] Received async jobId for ZIP upload", {
            jobId: result.jobId,
          });
          const key = uploadJobStore.makeKey(guildId, info.name);
          uploadJobStore.setActiveJob(key, result.jobId);
          start(result.jobId);
          toaster.info({
            title: "Processing Upload",
            description: "ZIP file is being processed. You can continue browsing.",
          });
          return; // defer completion until async finishes
        }
      } catch (err) {
        errs.push(err);
        console.error("Error uploading ZIP file:", err);
      }
    }

    if (!hasAsyncUpload) {
      if (errs.length > 0) {
        toaster.error({ title: "Upload Error", description: `${errs.length} file(s) failed.` });
      }
      setIsLoading(false);
    }
  };

  // Cleanup on unmount: stop worker
  useEffect(() => () => stop(), [stop]);

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
                <Text fontSize="sm" fontWeight="medium" color="gray.800">
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
                <Button variant="outline" loading={isLoading} disabled={isLoading || deleteLoading}>
                  <HiUpload />
                  Upload images
                </Button>
              </FileUpload.Trigger>
            </FileUpload.Root>
            <Button
              variant="subtle"
              colorPalette="red"
              loading={deleteLoading}
              disabled={deleteLoading || isLoading}
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
