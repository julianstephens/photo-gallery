import { Router } from "express";
import * as handlers from "./handlers/index.ts";
import { streamMedia } from "./handlers/media.ts";
import { requiresAdmin, requiresAuth, requiresGuildMembership } from "./middleware/auth.ts";
import { uploadRateLimiter } from "./middleware/rateLimit.ts";
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
authRouter.get("/auth/logout", requiresAuth, handlers.logout);
authRouter.get("/auth/me", requiresAuth, handlers.getCurrentUser);

/**********************
 * GALLERY ROUTES
 **********************/
const galleryRouter = Router();
galleryRouter.use("/galleries", requiresAuth);
galleryRouter.use("/galleries", requiresGuildMembership);
galleryRouter.get("/galleries", handlers.listGalleries);
galleryRouter.get("/galleries/single", handlers.getSingleGallery);
galleryRouter.get("/galleries/items", handlers.listGalleryItems);
galleryRouter.post("/galleries", requiresAdmin, handlers.createGallery);
galleryRouter.post("/galleries/default", handlers.setDefaultGallery);
galleryRouter.put("/galleries", requiresAdmin, handlers.updateGalleryName);
galleryRouter.delete("/galleries", requiresAdmin, handlers.removeGallery);

/**********************
 * GUILD ROUTES
 **********************/
const guildRouter = Router();
guildRouter.use(requiresAuth);
guildRouter.get("/guilds/default", handlers.getDefaultGuild);
guildRouter.post("/guilds/default", handlers.setDefaultGuild);

/**********************
 * UPLOAD ROUTES
 **********************/
const uploadsRouter = Router();
uploadsRouter.use(uploadRateLimiter);
uploadsRouter.use(requiresAuth);
uploadsRouter.use(requiresGuildMembership);
uploadsRouter.use(requiresAdmin);
uploadsRouter.post("/uploads/initiate", handlers.initiateUpload);
uploadsRouter.post("/uploads/chunk", handlers.uploadChunk);
uploadsRouter.post("/uploads/finalize", handlers.finalizeUpload);
uploadsRouter.get("/uploads/:uploadId/progress", handlers.getUploadProgress);
uploadsRouter.delete("/uploads/:uploadId", handlers.cancelUpload);
uploadsRouter.post("/uploads/cleanup", handlers.cleanupExpiredUploads);

/**********************
 * MEDIA PROXY ROUTE
 **********************/
const mediaRouter = Router();
mediaRouter.use(requiresAuth);
mediaRouter.use(requiresGuildMembership);
mediaRouter.get("/:galleryName/:year-:month-:day/*splat", streamMedia);

export default {
  healthRouter,
  authRouter,
  galleryRouter,
  guildRouter,
  uploadsRouter,
  mediaRouter,
};
