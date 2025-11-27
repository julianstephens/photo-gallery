import { httpClient } from "@/clients.ts";

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

export const initiateUpload = async (fileName: string, fileType: string, galleryName: string) => {
  const { data } = await httpClient.post("/uploads/initiate", {
    fileName,
    fileType,
    galleryName,
  });
  return data;
};

export const uploadChunk = async (uploadId: string, partNumber: number, chunk: Blob) => {
  const { data } = await httpClient.post(
    `/uploads/chunk?uploadId=${uploadId}&index=${partNumber}`,
    chunk,
    {
      headers: { "Content-Type": "application/octet-stream" },
    },
  );
  return data;
};
export const finalizeUpload = async (uploadId: string, fileName: string, totalParts: number) => {
  const { data } = await httpClient.post("/uploads/finalize", {
    uploadId,
    fileName,
    totalParts,
  });
  return data;
};

export const cancelUpload = async (uploadId: string) => {
  await httpClient.delete(`/uploads/${uploadId}`);
};

export const uploadFileInChunks = async (
  file: File,
  galleryName: string,
  onProgress: (progress: number) => void,
) => {
  const { uploadId } = await initiateUpload(file.name, file.type, galleryName);
  const totalParts = Math.ceil(file.size / CHUNK_SIZE);
  const uploadPromises = [];

  for (let i = 0; i < totalParts; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);
    uploadPromises.push(
      uploadChunk(uploadId, i + 1, chunk).then(() => {
        const progress = ((i + 1) / totalParts) * 100;
        onProgress(progress);
      }),
    );
  }

  await Promise.all(uploadPromises);

  return finalizeUpload(uploadId, file.name, totalParts);
};
