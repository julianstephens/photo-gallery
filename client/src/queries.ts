import {
  createGallerySchema,
  removeGallerySchema,
  type CreateGalleryRequest,
  type Gallery,
  type GalleryItemResponse,
  type GalleryMeta,
  type RemoveGalleryRequest,
  type UploadToGalleryRequest,
  type User,
} from "utils";
import { httpClient } from "./clients";

export const listGalleries = async (guildId: string): Promise<Gallery[]> => {
  const res = await httpClient.get<Gallery[]>("/galleries", { params: { guildId } });
  return res.data;
};

export const createGallery = async (req: CreateGalleryRequest): Promise<Gallery> => {
  const body = createGallerySchema.parse(req);
  const res = await httpClient.post<GalleryMeta>("/galleries", body);
  return {
    name: req.galleryName,
    meta: res.data,
  };
};

export const getGallery = async (guildId: string, galleryName: string): Promise<Gallery> => {
  const res = await httpClient.get<Gallery>("/galleries/single", {
    params: { guildId, galleryName },
  });
  return res.data;
};

export const listGalleryItems = async (galleryName: string): Promise<GalleryItemResponse> => {
  const res = await httpClient.get<GalleryItemResponse>("/galleries/items", {
    params: { galleryName },
  });
  return res.data;
};

export const getDefaultGuild = async (): Promise<string | null> => {
  const { data } = await httpClient.get<{ guildId: string | null }>("/guilds/default");
  return data.guildId;
};

export const setDefaultGuild = async (guildId: string): Promise<void> => {
  await httpClient.post("/guilds/default", {
    guildId,
  });
};

export const setDefaultGallery = async (guildId: string, galleryName: string): Promise<void> => {
  await httpClient.post("/galleries/default", {
    guildId,
    galleryName,
  });
};

export const uploadToGallery = async (uploadReq: UploadToGalleryRequest): Promise<void> => {
  const formData = new FormData();
  formData.append("guildId", uploadReq.guildId);
  formData.append("galleryName", uploadReq.galleryName);
  formData.append("file", uploadReq.file);

  await httpClient.post("/galleries/upload", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
};

export const removeGallery = async (req: RemoveGalleryRequest): Promise<void> => {
  const body = removeGallerySchema.parse(req);
  await httpClient.delete("/galleries", { data: body });
};

export const login = () => {
  window.location.assign("/api/auth");
};

export const logout = async () => {
  await httpClient.post("/auth/logout");
};

export const getCurrentUser = async () => {
  const { data } = await httpClient.get<User>("/auth/me");
  return data;
};
