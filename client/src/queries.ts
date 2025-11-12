import {
  createGallerySchema,
  type CreateGalleryRequest,
  type Gallery,
  type GalleryMeta,
  type User,
} from "utils";
import { httpClient } from "./clients";

export const getGalleryData = async (guildId: string): Promise<Gallery[]> => {
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
