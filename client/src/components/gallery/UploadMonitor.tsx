import { Tooltip } from "@/components/ui/tooltip";
import { uploadProgressStore, type ActiveUpload } from "@/lib/upload";
import {
  Badge,
  Box,
  Button,
  CloseButton,
  HStack,
  IconButton,
  Progress,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { HiCheck, HiOutlineExclamationCircle, HiXMark } from "react-icons/hi2";

export interface UploadMonitorProps {
  onClose?: () => void;
  isVisible?: boolean;
}

export const UploadMonitor = ({ onClose, isVisible = true }: UploadMonitorProps) => {
  const [uploads, setUploads] = useState<ActiveUpload[]>([]);

  useEffect(() => {
    const unsubscribe = uploadProgressStore.subscribe((activeUploads) => {
      setUploads(activeUploads);
    });
    return unsubscribe;
  }, []);

  const handleClearAll = () => {
    uploadProgressStore.clearCompleted();
  };

  const handleClearSingle = (uploadId: string) => {
    uploadProgressStore.removeUpload(uploadId);
  };

  // Show the monitor if there are uploads to display AND it's not hidden
  const shouldShow = uploads.length > 0 && isVisible;

  const activeCount = uploads.filter((u) => u.status === "uploading").length;
  const completedCount = uploads.filter((u) => u.status === "completed").length;
  const failedCount = uploads.filter((u) => u.status === "failed").length;
  const hasCompletedOrFailed = completedCount > 0 || failedCount > 0;

  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  if (!shouldShow) return null;

  return (
    <Box
      id="upload-monitor"
      position="fixed"
      bottom="1rem"
      right="1rem"
      width={{ base: "90%", sm: "20rem", md: "24rem" }}
      maxH="70vh"
      bg="gray.800"
      borderWidth="1px"
      borderColor="gray.700"
      borderRadius="md"
      boxShadow="lg"
      overflow="hidden"
      zIndex={100}
      role="region"
      aria-label="Upload monitor"
    >
      <HStack
        id={`upload-monitor-header`}
        px={3}
        py={2}
        gap={3}
        align="center"
        justify="space-between"
        bg="gray.900"
        borderBottomWidth="1px"
        borderBottomColor="gray.700"
      >
        <Text fontSize="sm" fontWeight="semibold">
          Uploads
        </Text>
        <HStack gap={2}>
          {hasCompletedOrFailed && (
            <Button
              size="xs"
              variant="ghost"
              onClick={handleClearAll}
              aria-label="Clear all completed uploads"
            >
              Clear All
            </Button>
          )}
          {onClose && <CloseButton size="sm" onClick={onClose} aria-label="Close upload monitor" />}
        </HStack>
      </HStack>

      <VStack
        id={`upload-monitor-list`}
        gap={0}
        align="stretch"
        maxH="calc(70vh - 2.5rem)"
        overflowY="auto"
        p={3}
      >
        {uploads.map((upload) => (
          <VStack
            id={`upload-monitor-item-${upload.id}`}
            key={upload.id}
            align="start"
            gap={2}
            p={3}
            borderWidth="1px"
            borderColor="gray.700"
            borderRadius="md"
            bg="gray.900"
            mb={2}
            _last={{ mb: 0 }}
          >
            {/* Header with file name and status */}
            <HStack
              id={`upload-monitor-item-header-${upload.id}`}
              w="full"
              justify="space-between"
              align="start"
              gap={2}
            >
              <VStack
                id={`upload-monitor-item-header-info-${upload.id}`}
                align="start"
                gap={0}
                flex={1}
                minW={0}
              >
                <Tooltip content={upload.fileName} positioning={{ overlap: true }}>
                  <Text fontSize="sm" fontWeight="medium" truncate w="full">
                    {upload.fileName}
                  </Text>
                </Tooltip>
                <Text fontSize="xs" color="gray.500" truncate w="full">
                  {upload.galleryName}
                </Text>
              </VStack>

              <HStack gap={1}>
                {upload.status === "uploading" && (
                  <Badge colorPalette="blue" variant="subtle">
                    <Spinner size="xs" mr={1} />
                    Uploading
                  </Badge>
                )}
                {upload.status === "completed" && (
                  <Badge colorPalette="green" variant="subtle">
                    <HiCheck />
                    Done
                  </Badge>
                )}
                {upload.status === "failed" && (
                  <Badge colorPalette="red" variant="subtle">
                    <HiOutlineExclamationCircle />
                    Failed
                  </Badge>
                )}
                {upload.status !== "uploading" && (
                  <IconButton
                    aria-label={`Clear ${upload.fileName}`}
                    size="xs"
                    variant="ghost"
                    onClick={() => handleClearSingle(upload.id)}
                  >
                    <HiXMark />
                  </IconButton>
                )}
              </HStack>
            </HStack>

            {/* Progress bar */}
            <Progress.Root
              w="full"
              value={upload.status != "failed" ? upload.progress : 100}
              max={100}
              striped={upload.status === "uploading"}
              animated={upload.status === "uploading"}
              colorPalette={
                upload.status === "uploading"
                  ? "blue"
                  : upload.status === "completed"
                    ? "green"
                    : "red"
              }
            >
              <Progress.Track>
                <Progress.Range />
              </Progress.Track>
              <Progress.ValueText />
            </Progress.Root>

            {/* Error message */}
            {upload.status === "failed" && upload.error && (
              <Text fontSize="xs" color="red.300">
                {upload.error}
              </Text>
            )}

            {/* Completion info */}
            {upload.completedTime && (
              <Text fontSize="xs" color="gray.400">
                {formatTime(upload.completedTime - upload.startTime)} total
              </Text>
            )}
          </VStack>
        ))}
      </VStack>

      {/* Summary */}
      <HStack
        id={`upload-monitor-summary`}
        px={3}
        py={2}
        gap={4}
        align="center"
        justify="center"
        bg="gray.900"
        borderTopWidth="1px"
        borderTopColor="gray.700"
        fontSize="xs"
        color="gray.400"
      >
        {activeCount > 0 && <Text>{activeCount} uploading</Text>}
        {completedCount > 0 && <Text>{completedCount} completed</Text>}
        {failedCount > 0 && <Text>{failedCount} failed</Text>}
      </HStack>
    </Box>
  );
};

export default UploadMonitor;
