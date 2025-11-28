import { httpClient } from "@/clients.ts";
import type { UploadProgress } from "utils";

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

export const initiateUpload = async (
  fileName: string,
  fileType: string,
  galleryName: string,
  totalSize: number,
  guildId: string,
) => {
  const { data } = await httpClient.post("/uploads/initiate", {
    fileName,
    fileType,
    galleryName,
    totalSize,
    guildId,
  });
  return data;
};

export const uploadChunk = async (uploadId: string, partNumber: number, chunk: Blob) => {
  const { data } = await httpClient.post(`/uploads/chunk`, chunk, {
    params: { uploadId, index: partNumber },
    headers: { "Content-Type": "application/octet-stream" },
  });
  return data;
};
export const finalizeUpload = async (uploadId: string) => {
  const { data } = await httpClient.post("/uploads/finalize", {
    uploadId,
  });
  return data;
};

export const cancelUpload = async (uploadId: string) => {
  await httpClient.delete(`/uploads/${uploadId}`);
};

export const getUploadProgress = async (uploadId: string): Promise<UploadProgress> => {
  const { data } = await httpClient.get<UploadProgress>(`/uploads/${uploadId}/progress`);
  return data;
};

export const uploadFileInChunks = async (
  file: File,
  galleryName: string,
  guildId: string,
  onProgress: (progress: number) => void,
) => {
  const { uploadId } = await initiateUpload(file.name, file.type, galleryName, file.size, guildId);
  const totalParts = Math.ceil(file.size / CHUNK_SIZE);
  const uploadPromises = [];

  for (let i = 0; i < totalParts; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);
    uploadPromises.push(
      uploadChunk(uploadId, i, chunk).then(() => {
        const progress = ((i + 1) / totalParts) * 100;
        onProgress(progress);
      }),
    );
  }

  await Promise.all(uploadPromises);

  return finalizeUpload(uploadId);
};
