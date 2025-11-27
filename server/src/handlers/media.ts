import type { Request, Response } from "express";
import { BucketService } from "../services/bucket.ts";

const bucketService = await BucketService.create();

/**
 * Escapes HTML entities to prevent XSS attacks.
 * Covers the most common characters that could be used in XSS payloads.
 */
const escapeHtml = (str: string): string => {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

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
      // Escape user-controlled values to prevent XSS
      const safeFileName = escapeHtml(fileName);
      const safePresignedUrl = escapeHtml(presignedUrl);
      const html = `
<!DOCTYPE html>
<html>
<head>
  <title>${safeFileName}</title>
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
  <img src="${safePresignedUrl}" alt="${safeFileName}" />
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
