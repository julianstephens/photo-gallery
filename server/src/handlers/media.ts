import type { Request, Response } from "express";
import { BucketService } from "../services/bucket.ts";

const bucketService = await BucketService.create();

const escapeHtml = (str: string) =>
  str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

export const streamMedia = async (req: Request, res: Response) => {
  const { galleryName } = req.params;
  const objectName = req.params.objectName as string | string[];
  const objectPath = Array.isArray(objectName) ? objectName.join("/") : objectName;
  const key = `${galleryName}/${objectPath}`;
  try {
    const accept = req.headers.accept || "";
    const wantsHtml = accept.includes("text/html");

    if (wantsHtml) {
      // Serve HTML page for viewing
      const presignedUrl = await bucketService.createPresignedUrl(key);
      const fileName = objectPath.split("/").pop() || "image";
      const escapedUrl = escapeHtml(presignedUrl);
      const escapedFileName = escapeHtml(fileName);
      const html = `
<!DOCTYPE html>
<html>
<head>
  <title>${escapedFileName}</title>
  <style>
    body {
      margin: 0;
      padding: 20px;
      background: #000;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    img {
      max-width: 100%;
      max-height: 100vh;
      object-fit: contain;
    }
  </style>
</head>
<body>
  <img src="${escapedUrl}" alt="${escapedFileName}" />
</body>
</html>`;
      res.setHeader("Content-Type", "text/html");
      res.send(html);
    } else {
      // Serve image data for previews/thumbnails
      const { data, contentType } = await bucketService.getObject(key);
      res.setHeader("Content-Type", contentType);
      res.send(data);
    }
  } catch (error) {
    console.error("Error streaming media:", error);
    res.status(500).send("Error streaming media");
  }
};
