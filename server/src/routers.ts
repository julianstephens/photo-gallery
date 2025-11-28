import { Router } from "express";
import * as handlers from "./handlers/index.ts";
import { streamMedia } from "./handlers/media.ts";
import { requiresAdmin, requiresAuth } from "./middleware/auth.ts";
import env from "./schemas/env.ts";

/**********************
 * HEALTH ROUTES
 **********************/
const healthRouter = Router();
healthRouter.get("/healthz", (_, res) => {
  res.json({ status: "ok" });
});
healthRouter.get("/readyz", (_, res) => {
  res.json({ status: "ready" });
});

/**********************
 * AUTH ROUTES
 **********************/
const authRouter = Router();
authRouter.get("/auth", (_, res) => {
  res.redirect(
    `https://discord.com/oauth2/authorize?client_id=${env.DISCORD_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(env.DISCORD_REDIRECT_URI)}&scope=identify+guilds+openid`,
  );
});
authRouter.get("/auth/discord", handlers.discordCallback);
authRouter.get("/auth/logout", handlers.logout);
authRouter.get("/auth/me", handlers.getCurrentUser);

/**********************
 * GALLERY ROUTES
 **********************/
const galleryRouter = Router();
galleryRouter.get("/galleries", handlers.listGalleries);
galleryRouter.get("/galleries/single", handlers.getSingleGallery);
galleryRouter.get("/galleries/items", handlers.listGalleryItems);
galleryRouter.get("/images/:galleryName/{*imagePath}", handlers.getImage);
galleryRouter.post("/galleries", handlers.createGallery);
galleryRouter.post("/galleries/default", handlers.setDefaultGallery);
galleryRouter.put("/galleries", requiresAdmin, handlers.updateGalleryName);
galleryRouter.delete("/galleries", requiresAdmin, handlers.removeGallery);

/**********************
 * GUILD ROUTES
 **********************/
const guildRouter = Router();
guildRouter.get("/guilds/default", handlers.getDefaultGuild);
guildRouter.post("/guilds/default", handlers.setDefaultGuild);

/**********************
 * UPLOAD ROUTES
 **********************/
const uploadsRouter = Router();
uploadsRouter.post("/uploads/initiate", requiresAuth, handlers.initiateUpload);
uploadsRouter.post("/uploads/chunk", requiresAuth, handlers.uploadChunk);
uploadsRouter.post("/uploads/finalize", requiresAuth, handlers.finalizeUpload);
uploadsRouter.get("/uploads/:uploadId/progress", requiresAuth, handlers.getUploadProgress);
uploadsRouter.delete("/uploads/:uploadId", requiresAdmin, handlers.cancelUpload);
uploadsRouter.post("/uploads/cleanup", requiresAdmin, handlers.cleanupExpiredUploads);

/**********************
 * MEDIA PROXY ROUTE
 **********************/
const mediaRouter = Router();
mediaRouter.get("/:galleryName/{*objectName}", streamMedia);

export default {
  healthRouter,
  authRouter,
  galleryRouter,
  guildRouter,
  uploadsRouter,
  mediaRouter,
};
