import {
  createGallerySchema,
  removeGallerySchema,
  updateGalleryNameSchema,
  type CreateGalleryRequest,
  type Gallery,
  type GalleryItemResponse,
  type GalleryMeta,
  type RemoveGalleryRequest,
  type UpdateGalleryNameRequest,
  type User,
} from "utils";
import { API_BASE_URL, httpClient } from "./clients";

/**********************
 * GALLERY QUERIES
 **********************/

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

export const renameGallery = async (req: UpdateGalleryNameRequest): Promise<void> => {
  const { guildId, galleryName, newGalleryName } = updateGalleryNameSchema.parse(req);
  await httpClient.put("galleries", {
    guildId,
    galleryName,
    newGalleryName,
  });
};

export const setDefaultGallery = async (guildId: string, galleryName: string): Promise<void> => {
  await httpClient.post("galleries/default", {
    guildId,
    galleryName,
  });
};

export const removeGallery = async (req: RemoveGalleryRequest): Promise<void> => {
  const body = removeGallerySchema.parse(req);
  await httpClient.delete("galleries", { data: body });
};

/**********************
 * GUILD QUERIES
 **********************/

export const getDefaultGuild = async (): Promise<string | null> => {
  const { data } = await httpClient.get<{ guildId: string | null }>("guilds/default");
  return data.guildId;
};

export const setDefaultGuild = async (guildId: string): Promise<void> => {
  await httpClient.post("guilds/default", {
    guildId,
  });
};

/**********************
 * UPLOAD QUERIES
 **********************/

/**********************
 * AUTH QUERIES
 **********************/

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
  const healthUrl = `${primaryOrigin}/api/healthz`;
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

  // Fallback: attempt to use the direct API base configured (if available) or primary
  const fallbackBase = (API_BASE_URL as string) ?? base;
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
