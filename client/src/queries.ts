import {
  createGallerySchema,
  removeGallerySchema,
  type CreateGalleryRequest,
  type Gallery,
  type GalleryItemResponse,
  type GalleryMeta,
  type RemoveGalleryRequest,
  type UploadJob,
  type UploadToGalleryRequest,
  type User,
} from "utils";
import { API_BASE_URL, httpClient, UPLOAD_BASE_URL, uploadHttpClient } from "./clients";

export const listGalleries = async (guildId: string): Promise<Gallery[]> => {
  const res = await httpClient.get<Gallery[]>("galleries", { params: { guildId } });
  return res.data;
};

export const createGallery = async (req: CreateGalleryRequest): Promise<Gallery> => {
  const body = createGallerySchema.parse(req);
  const res = await httpClient.post<GalleryMeta>("galleries", body);
  return {
    name: req.galleryName,
    meta: res.data,
  };
};

export const getGallery = async (guildId: string, galleryName: string): Promise<Gallery> => {
  const res = await httpClient.get<Gallery>("galleries/single", {
    params: { guildId, galleryName },
  });
  return res.data;
};

export const listGalleryItems = async (
  guildId: string,
  galleryName: string,
): Promise<GalleryItemResponse> => {
  const res = await httpClient.get<GalleryItemResponse>("galleries/items", {
    params: { guildId, galleryName },
  });
  return res.data;
};

export const getDefaultGuild = async (): Promise<string | null> => {
  const { data } = await httpClient.get<{ guildId: string | null }>("guilds/default");
  return data.guildId;
};

export const setDefaultGuild = async (guildId: string): Promise<void> => {
  await httpClient.post("guilds/default", {
    guildId,
  });
};

export const setDefaultGallery = async (guildId: string, galleryName: string): Promise<void> => {
  await httpClient.post("galleries/default", {
    guildId,
    galleryName,
  });
};

export const uploadToGallery = async (
  uploadReq: UploadToGalleryRequest,
): Promise<{ type: "sync" | "async"; jobId?: string; uploaded?: unknown[] }> => {
  const formData = new FormData();
  formData.append("guildId", uploadReq.guildId);
  formData.append("galleryName", uploadReq.galleryName);
  formData.append("file", uploadReq.file);

  const response = await uploadHttpClient.post("galleries/upload", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return response.data;
};

export const getUploadJob = async (jobId: string): Promise<UploadJob> => {
  const { data } = await httpClient.get(`galleries/upload/${jobId}`);
  return data;
};

export const removeGallery = async (req: RemoveGalleryRequest): Promise<void> => {
  const body = removeGallerySchema.parse(req);
  await httpClient.delete("galleries", { data: body });
};

export const login = async () => {
  const base = (httpClient.defaults.baseURL as string) ?? API_BASE_URL ?? "/api/";
  const primaryAuthUrl = new URL("auth", base).toString();
  const primaryOrigin = new URL(primaryAuthUrl).origin;
  console.debug("[queries] Attempting auth redirect:", {
    primaryAuthUrl,
    base,
    PRIMARY_ORIGIN: primaryOrigin,
  });

  // If the API origin is reachable and responds with CORS/health, prefer primary
  const healthUrl = `${primaryOrigin}/healthz`;
  try {
    const res = await fetch(healthUrl, { method: "GET", mode: "cors", credentials: "include" });
    if (res.ok) {
      console.debug("[queries] Primary API responsive. Redirecting to auth URL.", {
        primaryAuthUrl,
      });
      window.location.assign(primaryAuthUrl);
      return;
    }
    console.warn("[queries] Primary health check responded non-ok. Falling back.", {
      status: res.status,
    });
  } catch (err) {
    console.warn("[queries] Primary health check failed. Falling back to direct API.", err);
  }

  // Fallback: attempt to use the direct upload base configured (if available) or primary
  const fallbackBase = (UPLOAD_BASE_URL as string) ?? base;
  const fallbackAuthUrl = new URL("auth", fallbackBase).toString();
  console.debug("[queries] Redirecting to fallback auth URL:", { fallbackAuthUrl });
  window.location.assign(fallbackAuthUrl);
};

export const logout = async () => {
  await httpClient.post("auth/logout");
};

export const getCurrentUser = async () => {
  const { data } = await httpClient.get<User>("auth/me");
  return data;
};
