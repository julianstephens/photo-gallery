import type { Request, Response } from "express";
import { BucketService } from "../services/bucket.ts";

const bucketService = await BucketService.create();

export const streamMedia = async (req: Request, res: Response) => {
  const { galleryName } = req.params;
  const objectName = req.params.objectName as string | string[];
  const objectPath = Array.isArray(objectName) ? objectName.join("/") : objectName;
  const key = `${galleryName}/${objectPath}`;
  try {
    const presignedUrl = await bucketService.createPresignedUrl(key);
    res.redirect(presignedUrl);
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    res.status(500).send("Error streaming media");
  }
};
