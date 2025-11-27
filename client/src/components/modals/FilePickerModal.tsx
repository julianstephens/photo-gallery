import { ChunkedUploader } from "@/lib/upload/chunkedUpload";
import { Box, Input, Progress, Text, VStack } from "@chakra-ui/react";
import { useCallback, useRef, useState } from "react";
import type { ChunkedUploadProgress } from "utils";
import { BaseModal, type ModalProps } from "./base";

export interface FilePickerModalProps extends ModalProps {
  onUploadComplete?: (filePath: string) => void;
}

export const FilePickerModal = ({ open, closeModal, onUploadComplete }: FilePickerModalProps) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<ChunkedUploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uploaderRef = useRef<ChunkedUploader | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
    }
  };

  const handleProgress = useCallback((prog: ChunkedUploadProgress) => {
    setProgress(prog);
  }, []);

  const handleUpload = async () => {
    if (!selectedFile) {
      setError("Please select a file first");
      return;
    }

    setUploading(true);
    setError(null);
    setProgress(null);

    const uploader = new ChunkedUploader(selectedFile, {
      onProgress: handleProgress,
      onError: (err) => {
        console.error("Chunk upload error:", err);
        setError(err.message || "A chunk failed to upload");
      },
    });
    uploaderRef.current = uploader;

    try {
      const result = await uploader.start();

      if (result.success && result.filePath) {
        onUploadComplete?.(result.filePath);
        handleClose();
      } else {
        setError(result.error || "Upload failed");
      }
    } finally {
      setUploading(false);
      uploaderRef.current = null;
    }
  };

  const handleClose = () => {
    if (uploaderRef.current) {
      uploaderRef.current.abort();
      uploaderRef.current = null;
    }
    setSelectedFile(null);
    setProgress(null);
    setError(null);
    setUploading(false);
    closeModal();
  };

  return (
    <BaseModal
      open={open}
      closeModal={handleClose}
      title="Upload Files"
      actionButtonText={uploading ? "Uploading..." : "Upload"}
      actionButtonLoading={uploading}
      actionButtonOnClick={handleUpload}
    >
      <VStack gap={4} align="stretch">
        <Box>
          <Input
            ref={fileInputRef}
            type="file"
            onChange={handleFileChange}
            disabled={uploading}
            accept="*/*"
          />
        </Box>

        {selectedFile && (
          <Box>
            <Text fontSize="sm" color="gray.600">
              Selected: {selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
            </Text>
          </Box>
        )}

        {progress && (
          <Box>
            <Progress.Root value={progress.percentage}>
              <Progress.Track>
                <Progress.Range />
              </Progress.Track>
            </Progress.Root>
            <Text fontSize="sm" mt={1}>
              {progress.uploadedChunks} / {progress.totalChunks} chunks ({progress.percentage}%)
            </Text>
          </Box>
        )}

        {error && (
          <Box>
            <Text color="red.500" fontSize="sm">
              {error}
            </Text>
          </Box>
        )}
      </VStack>
    </BaseModal>
  );
};
