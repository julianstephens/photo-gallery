import { Router } from "express";
import multer from "multer";
import * as handlers from "./handlers/index.ts";
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
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500 MB - allow larger zip archives
  },
});
const galleryRouter = Router();
galleryRouter.get("/galleries", handlers.listGalleries);
galleryRouter.get("/galleries/items", handlers.listGalleryItems);
galleryRouter.get("/galleries/upload/:jobId", handlers.getUploadJob);
galleryRouter.post("/galleries", handlers.createGallery);
galleryRouter.post("/galleries/upload", upload.single("file"), handlers.uploadToGallery);
galleryRouter.post("/galleries/default", handlers.setDefaultGallery);
galleryRouter.delete("/galleries", handlers.removeGallery);

/**********************
 * GUILD ROUTES
 **********************/
const guildRouter = Router();
guildRouter.get("/guilds/default", handlers.getDefaultGuild);
guildRouter.post("/guilds/default", handlers.setDefaultGuild);

export default {
  healthRouter,
  authRouter,
  galleryRouter,
  guildRouter,
};
