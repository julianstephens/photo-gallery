import { toaster } from "@/components/ui/toaster";
import { useUploadContext } from "@/hooks";
import { logger } from "@/lib/logger";
import { uploadFileInChunks, uploadProgressStore } from "@/lib/upload";
import { Button, FileUpload, Icon, Menu, type FileUploadFileAcceptDetails } from "@chakra-ui/react";
import { useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { useRef, useState, type InputHTMLAttributes } from "react";
import { HiOutlineUpload } from "react-icons/hi";
import { MdOutlineDriveFolderUpload } from "react-icons/md";
import { RiArrowDropDownLine } from "react-icons/ri";

interface UploadPhotosButtonProps {
  guildId: string;
  galleryName: string;
  buttonText?: string;
  buttonVariant: "outline" | "solid" | "ghost" | "plain";
  buttonColorPalette: "gray" | "red" | "blue" | "green" | "yellow" | "purple" | "pink" | "orange";
  fullWidth?: boolean;
}

export const UploadPhotosButton = ({
  guildId,
  galleryName,
  buttonVariant = "outline",
  buttonColorPalette = "gray",
  fullWidth = false,
}: UploadPhotosButtonProps) => {
  const MAX_FILE_UPLOAD_SIZE_BYTES = 500 * 1024 * 1024; // 500MB per file upload
  const MAX_FILE_UPLOAD_COUNT = 50;
  const MAX_FOLDER_UPLOAD_SIZE_BYTES = 150 * 1024 * 1024; // 150MB per file when uploading folders
  const MAX_FOLDER_UPLOAD_COUNT = 200; // allow larger folder selections without overwhelming the UI
  const formatBytesToMB = (bytes: number) => `${Math.round(bytes / (1024 * 1024))}MB`;

  const queryClient = useQueryClient();
  const { updateUploadMonitorVisibility, setHasActiveUploads } = useUploadContext();
  const [isLoading, setIsLoading] = useState(false);
  const [, setUploadProgress] = useState<number | null>(null);
  const fileUploadRef = useRef<HTMLInputElement>(null);
  const folderUploadRef = useRef<HTMLInputElement>(null);
  const folderPickerProps = {
    webkitdirectory: "",
    directory: "",
  } as InputHTMLAttributes<HTMLInputElement>;

  const getNormalizedUploadPath = (file: File) => {
    const typedFile = file as File & { webkitRelativePath?: string };
    const relativePath = typedFile.webkitRelativePath ?? "";
    return (relativePath || file.name).replace(/\\/g, "/");
  };

  const isAppleDoubleFile = (file: File): boolean => {
    const normalizedPath = getNormalizedUploadPath(file);
    if (normalizedPath.includes("/__MACOSX/")) {
      return true;
    }
    const segments = normalizedPath.split("/");
    const lastSegment = segments.length > 0 ? segments[segments.length - 1] : file.name;
    return lastSegment.startsWith("._");
  };

  const isValidImageFile = (file: File): boolean => {
    // Check if file is an image type
    return file.type.startsWith("image/");
  };

  const uploadFiles = async (details: FileUploadFileAcceptDetails) => {
    setIsLoading(true);
    setUploadProgress(0);
    const files = details.files;

    if (!guildId) {
      toaster.error({
        title: "Upload Failed",
        description: "Guild information is missing",
      });
      setIsLoading(false);
      return;
    }

    if (files.length === 0) {
      setIsLoading(false);
      return;
    }

    const filteredMetadataFiles: File[] = [];
    let appleDoubleCount = 0;

    for (const file of files) {
      if (isAppleDoubleFile(file)) {
        appleDoubleCount++;
        continue;
      }
      filteredMetadataFiles.push(file);
    }

    if (appleDoubleCount > 0) {
      toaster.info({
        title: "Skipped macOS helper files",
        description: `${appleDoubleCount} AppleDouble file${appleDoubleCount !== 1 ? "s were" : " was"} ignored automatically.`,
      });
    }

    if (filteredMetadataFiles.length === 0) {
      setIsLoading(false);
      return;
    }

    // Filter out non-image files
    const validFiles = filteredMetadataFiles.filter(isValidImageFile);
    const invalidCount = filteredMetadataFiles.length - validFiles.length;

    if (invalidCount > 0) {
      toaster.warning({
        title: "Skipped Non-Image Files",
        description: `${invalidCount} file${invalidCount !== 1 ? "s were" : " was"} skipped because ${invalidCount !== 1 ? "they are" : "it is"} not an image.`,
      });
    }

    if (validFiles.length === 0) {
      toaster.error({
        title: "No Image Files",
        description: "Please select at least one image file to upload.",
      });
      setIsLoading(false);
      return;
    }

    try {
      setHasActiveUploads(true);
      updateUploadMonitorVisibility(true);
      logger.info(
        { fileCount: validFiles.length, galleryName, guildId },
        "[UploadPhotosButton] Starting file uploads",
      );

      // Limit concurrent uploads to 5 to avoid overwhelming the server and hitting rate limits
      const MAX_CONCURRENT_UPLOADS = 5;

      // Create upload IDs and add all uploads to the store upfront so queued items are visible
      const uploadIds = validFiles.map(
        () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      );
      uploadIds.forEach((uploadId, index) => {
        uploadProgressStore.addUpload(uploadId, validFiles[index].name, galleryName, guildId);
      });

      const uploadQueue = validFiles.map((file, index) => async () => {
        const uploadId = uploadIds[index];

        try {
          logger.debug({ uploadId, fileName: file.name }, "[UploadPhotosButton] Processing upload");
          uploadProgressStore.startUpload(uploadId);
          await uploadFileInChunks(file, galleryName, guildId, (progress) => {
            uploadProgressStore.updateProgress(uploadId, progress);
          });
          uploadProgressStore.completeUpload(uploadId);
          logger.debug({ uploadId, fileName: file.name }, "[UploadPhotosButton] Upload completed");
        } catch (error) {
          let errMsg = "An error occurred during the upload.";
          if (error instanceof AxiosError) {
            errMsg = error.response?.data?.error || errMsg;
          }
          uploadProgressStore.failUpload(uploadId, errMsg);
          logger.error(
            { uploadId, fileName: file.name, error: errMsg },
            "[UploadPhotosButton] Upload failed",
          );
          throw error;
        }
      });

      // Execute uploads with concurrency limit
      const results: PromiseSettledResult<void>[] = [];
      let activeCount = 0;
      let queueIndex = 0;

      await new Promise<void>((resolve) => {
        const executeNext = async () => {
          while (queueIndex < uploadQueue.length && activeCount < MAX_CONCURRENT_UPLOADS) {
            activeCount++;
            const currentIndex = queueIndex;
            queueIndex++;

            try {
              await uploadQueue[currentIndex]();
              results[currentIndex] = { status: "fulfilled", value: undefined };
            } catch (error) {
              results[currentIndex] = { status: "rejected", reason: error };
            }

            activeCount--;

            // After each upload completes, invalidate the gallery queries to show updated counts
            if (guildId && results[currentIndex].status === "fulfilled") {
              queryClient.invalidateQueries({
                queryKey: ["galleries", { guildId }],
              });
              queryClient.invalidateQueries({
                queryKey: ["gallery", { guildId, galleryName }],
              });
            }

            if (queueIndex < uploadQueue.length) {
              setTimeout(executeNext, 0);
            } else if (activeCount === 0) {
              resolve();
            }
          }

          if (activeCount === 0 && queueIndex >= uploadQueue.length) {
            resolve();
          }
        };

        for (let i = 0; i < Math.min(MAX_CONCURRENT_UPLOADS, uploadQueue.length); i++) {
          setTimeout(executeNext, 0);
        }
      });

      const failedCount = results.filter((r) => r.status === "rejected").length;
      const successCount = results.filter((r) => r.status === "fulfilled").length;

      logger.info(
        { successCount, failedCount, galleryName, guildId },
        "[UploadPhotosButton] Upload batch completed",
      );

      if (failedCount === 0) {
        toaster.success({
          title: "Upload Completed",
          description: `${successCount} file${successCount !== 1 ? "s" : ""} uploaded successfully.`,
        });
      } else if (successCount === 0) {
        toaster.error({
          title: "Upload Failed",
          description: `All ${failedCount} file${failedCount !== 1 ? "s" : ""} failed to upload.`,
        });
      } else {
        toaster.warning({
          title: "Partial Upload",
          description: `${successCount} file${successCount !== 1 ? "s" : ""} uploaded, ${failedCount} failed.`,
        });
      }

      // Refetch gallery list to update totalItems count (final refresh after all uploads)
      if (guildId) {
        logger.debug({ guildId, galleryName }, "[UploadPhotosButton] Final gallery data refresh");
        // Do a final refetch to ensure gallery list is up to date
        await queryClient.refetchQueries({
          queryKey: ["galleries", { guildId }],
          type: "active",
        });
        // Final refresh for gallery items
        await queryClient.refetchQueries({
          queryKey: ["galleryItems", { guildId, galleryName }],
          type: "active",
        });
      }
    } catch (error) {
      logger.error(
        { err: error, errorMessage: error instanceof Error ? error.message : String(error) },
        "[UploadPhotosButton] Error uploading files",
      );
    } finally {
      setIsLoading(false);
      setUploadProgress(null);
      setHasActiveUploads(false);
      if (fileUploadRef.current) {
        fileUploadRef.current.value = "";
      }
      if (folderUploadRef.current) {
        folderUploadRef.current.value = "";
      }
    }
  };

  return (
    <>
      <FileUpload.Root
        style={{ display: "none" }}
        accept={["image/*"]}
        maxFileSize={MAX_FILE_UPLOAD_SIZE_BYTES}
        maxFiles={MAX_FILE_UPLOAD_COUNT}
        onFileReject={(details) => {
          if (details.files.some((f) => f.errors.includes("TOO_MANY_FILES"))) {
            toaster.error({
              title: "Too Many Files",
              description: `Maximum ${MAX_FILE_UPLOAD_COUNT} files per upload. Please select fewer files.`,
            });
          } else if (details.files.some((f) => f.errors.includes("TOO_LARGE"))) {
            toaster.error({
              title: "File Too Large",
              description: `Maximum file size is ${formatBytesToMB(MAX_FILE_UPLOAD_SIZE_BYTES)}. Please select smaller files.`,
            });
          } else if (details.files.some((f) => f.errors.includes("FILE_INVALID_TYPE"))) {
            toaster.error({
              title: "Invalid File Type",
              description: "Please select image files.",
            });
          } else {
            console.error("Rejected files:", details.files);
          }
        }}
        onFileAccept={(details) => {
          void uploadFiles(details);
        }}
      >
        <FileUpload.HiddenInput ref={fileUploadRef} multiple />
      </FileUpload.Root>

      <FileUpload.Root
        style={{ display: "none" }}
        accept={["image/*"]}
        maxFileSize={MAX_FOLDER_UPLOAD_SIZE_BYTES}
        maxFiles={MAX_FOLDER_UPLOAD_COUNT}
        onFileReject={(details) => {
          if (details.files.some((f) => f.errors.includes("TOO_MANY_FILES"))) {
            toaster.error({
              title: "Too Many Files",
              description: `Maximum ${MAX_FOLDER_UPLOAD_COUNT} items per folder upload. Please select fewer items.`,
            });
          } else if (details.files.some((f) => f.errors.includes("TOO_LARGE"))) {
            toaster.error({
              title: "File Too Large",
              description: `Maximum file size is ${formatBytesToMB(MAX_FOLDER_UPLOAD_SIZE_BYTES)}. Please select smaller files.`,
            });
          } else if (details.files.some((f) => f.errors.includes("FILE_INVALID_TYPE"))) {
            toaster.error({
              title: "Invalid File Type",
              description: "Please select image files.",
            });
          } else {
            console.error("Rejected files:", details.files);
          }
        }}
        onFileAccept={(details) => {
          void uploadFiles(details);
        }}
      >
        <FileUpload.HiddenInput ref={folderUploadRef} multiple {...folderPickerProps} />
      </FileUpload.Root>

      <Menu.Root>
        <Menu.Trigger {...(fullWidth ? { w: "full" } : {})} asChild>
          <Button
            minW="190px"
            variant={buttonVariant}
            colorPalette={buttonColorPalette}
            _active={{ outline: "none" }}
            _focus={{ outline: "none" }}
          >
            <Icon>
              <HiOutlineUpload />
            </Icon>{" "}
            Upload <RiArrowDropDownLine />
          </Button>
        </Menu.Trigger>
        <Menu.Positioner style={{ width: "var(--reference-width)" }}>
          <Menu.Content>
            <Menu.Item
              value="Upload Files"
              onClick={(event) => {
                event.preventDefault();
                fileUploadRef.current?.click();
              }}
            >
              <Button
                variant="plain"
                w="full"
                loading={isLoading}
                disabled={isLoading}
                _active={{ outline: "none", border: "none" }}
                _focus={{ outline: "none", border: "none" }}
              >
                <HiOutlineUpload />
                Upload Files
              </Button>
            </Menu.Item>
            <Menu.Item
              value="Upload Folders"
              onClick={(event) => {
                event.preventDefault();
                folderUploadRef.current?.click();
              }}
            >
              <Button variant="plain" w="full" loading={isLoading} disabled={isLoading}>
                <MdOutlineDriveFolderUpload />
                Upload Folders
              </Button>
            </Menu.Item>
          </Menu.Content>
        </Menu.Positioner>
      </Menu.Root>
    </>
  );
};
