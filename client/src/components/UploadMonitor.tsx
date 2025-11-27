import {
  Badge,
  Box,
  Button,
  CloseButton,
  HStack,
  Icon,
  Progress,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { HiCheck, HiOutlineExclamationCircle } from "react-icons/hi2";
import type { UploadJob } from "utils";

export interface UploadMonitorChakraProps {
  jobs: UploadJob[];
  isOpen?: boolean;
  onClose: () => void;
  onRetry?: (jobId: string) => void;
  onCancel?: (jobId: string) => void;
}

export const UploadMonitor = ({
  jobs,
  isOpen = true,
  onClose,
  onRetry,
  onCancel,
}: UploadMonitorChakraProps) => {
  if (!isOpen) return null;

  const jobDone = (job: UploadJob) => job.status === "completed" || job.status === "failed";
  const allDone = jobs.length > 0 && jobs.every((j) => jobDone(j));

  const getUploadProgress = (job: UploadJob): number => {
    if (!job.progress || job.progress.totalFiles === 0) return 0;
    return (job.progress.processedFiles / job.progress.totalFiles) * 100;
  };

  return (
    <Box
      position="fixed"
      bottom="1rem"
      right="1rem"
      width={{ base: "full", sm: "20rem", md: "24rem" }}
      maxH="70vh"
      bg="gray.800"
      borderWidth="1px"
      borderColor="gray.700"
      borderRadius="md"
      boxShadow="lg"
      overflow="hidden"
      zIndex={9999}
      role="region"
      aria-label="Upload monitor"
    >
      <HStack
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
          Upload Monitor
        </Text>

        <CloseButton size="sm" onClick={onClose} aria-label="Close upload monitor" />
      </HStack>

      <VStack gap={0} align="stretch" maxH="48vh" overflowY="auto" p={3}>
        {jobs.length === 0 && (
          <Text fontSize="sm" color="gray.500" px={1} py={3}>
            No active uploads
          </Text>
        )}

        {jobs.map((job) => {
          const statusColor =
            job.status === "completed"
              ? "green.400"
              : job.status === "failed"
                ? "red.400"
                : "blue.400";

          return (
            <Box
              key={job.jobId}
              p={3}
              borderRadius="md"
              _notLast={{ borderBottom: "1px solid", borderColor: "gray.700" }}
            >
              <HStack align="flex-start" gap={3}>
                <Box pt={1}>
                  {!jobDone(job) && <Spinner size="sm" color={statusColor} />}
                  {job.status === "completed" && (
                    <Icon fill="green.400">
                      <HiCheck />
                    </Icon>
                  )}
                  {job.status === "failed" && (
                    <Icon fill="red.400">
                      <HiOutlineExclamationCircle />
                    </Icon>
                  )}
                </Box>

                <VStack align="stretch" gap={1} flex="1" minW={0}>
                  <HStack justify="space-between" align="center">
                    <Text fontSize="sm" fontWeight="medium" truncate>
                      {job.galleryName}
                    </Text>

                    <Badge
                      colorPalette={
                        job.status === "completed"
                          ? "green"
                          : job.status === "failed"
                            ? "red"
                            : "blue"
                      }
                      fontSize="0.65rem"
                    >
                      {job.status}
                    </Badge>
                  </HStack>

                  <Text fontSize="xs" color="gray.500">
                    File: {job.filename} ({(job.fileSize / (1024 * 1024)).toFixed(2)} MB)
                    {job.error ? ` - Error: ${job.error}` : ""}
                    {job.progress
                      ? ` - ${job.progress.processedFiles} / ${job.progress.totalFiles} files processed`
                      : ""}
                  </Text>

                  <Progress.Root
                    size="xs"
                    value={getUploadProgress(job)}
                    striped={!jobDone(job)}
                    animated={!jobDone(job)}
                    aria-label={`${job.galleryName} upload progress`}
                    colorPalette={
                      job.status === "completed"
                        ? "green"
                        : job.status === "failed"
                          ? "red"
                          : "blue"
                    }
                  >
                    <Progress.Track>
                      <Progress.Range />
                    </Progress.Track>
                  </Progress.Root>

                  <HStack justify="space-between" pt={1}>
                    <Text fontSize="xs" color="gray.500">
                      {job.startedAt ? `Started ${new Date(job.startedAt).toLocaleString()}` : ""}
                    </Text>

                    <HStack gap={2}>
                      {onRetry && job.status === "failed" && (
                        <Button size="xs" variant="outline" onClick={() => onRetry(job.jobId)}>
                          Retry
                        </Button>
                      )}

                      {onCancel && !jobDone(job) && (
                        <Button
                          size="xs"
                          variant="ghost"
                          colorPalette="red"
                          onClick={() => onCancel(job.jobId)}
                        >
                          Cancel
                        </Button>
                      )}
                    </HStack>
                  </HStack>
                </VStack>
              </HStack>
            </Box>
          );
        })}
      </VStack>

      {allDone && (
        <HStack
          gap={3}
          px={3}
          py={2}
          borderTopWidth="1px"
          borderTopColor="gray.700"
          justify="center"
          bg="gray.900"
        >
          <Text fontSize="sm" color="gray.500">
            All uploads complete
          </Text>
          <Button size="sm" onClick={onClose} variant="ghost">
            Dismiss
          </Button>
        </HStack>
      )}
    </Box>
  );
};

export default UploadMonitor;
