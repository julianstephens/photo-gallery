import { lookup as mimeFromExt } from "mime-types";
import { extname } from "path";
import unzipper from "unzipper";
import {
  createGallerySchema,
  galleryMetaSchema,
  type CreateGalleryRequest,
  type Gallery,
  type SetDefaultGalleryRequest,
  type UploadJobProgress,
} from "utils";
import { appLogger } from "../middleware/logger.ts";
import redis from "../redis.ts";
import { BucketService } from "../services/bucket.ts";
import { UploadService } from "../services/upload.ts";
import { UploadJobService } from "../services/uploadJob.ts";
import { InvalidInputError, validateString } from "../utils.ts";

const EXPIRES_ZSET = "galleries:expiries";

class UnsupportedMimeTypeError extends Error {
  constructor() {
    super("Unsupported file type. Upload an image/* or a .zip of images.");
    this.name = "UnsupportedMimeTypeError";
  }
}

const GalleryNameError = "Gallery name cannot be empty";
const ImagePathError = "Image path is required";
const MAX_ZIP_ENTRIES = 1000;
const MAX_ZIP_UNCOMPRESSED_BYTES = 500 * 1024 * 1024; // 500 MB guardrail
const PROGRESS_UPDATE_INTERVAL = 10; // Update progress every N files

export class GalleryController {
  #bucketService: BucketService;
  #uploadService: UploadService;
  #uploadJobService: UploadJobService;

  constructor() {
    this.#bucketService = new BucketService();
    this.#uploadService = new UploadService();
    this.#uploadJobService = new UploadJobService();
  }

  #recordToMetadata = (record: Record<string, string> | null) => {
    if (!record) {
      throw new Error("Missing gallery metadata");
    }

    const parsed = {
      createdAt: Number(record.createdAt) || NaN,
      expiresAt: Number(record.expiresAt) || NaN,
      ttlWeeks: Number(record.ttlWeeks) || NaN,
      createdBy: record.createdBy || "",
    };

    const result = galleryMetaSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error("Corrupted gallery metadata");
    }

    return parsed;
  };

  #galleryKeys = (guildId: string, galleryName?: string) => {
    const listKey = `guild:${guildId}:galleries`;
    const memberKey = `guild:${guildId}:gallery:${galleryName}`;
    let metaKey: string | undefined;
    if (galleryName) {
      metaKey = `guild:${guildId}:gallery:${galleryName}:meta`;
    }
    return { listKey, memberKey, metaKey };
  };

  listGalleries = async (guildId: string) => {
    const validGuildId = validateString(guildId, "Guild ID is required");

    const { listKey } = this.#galleryKeys(validGuildId);
    const galleries = await redis.client.sMembers(listKey);
    if (!galleries || galleries.length === 0) return [];

    const now = Date.now();
    const multi = redis.client.multi();
    const metaKeys: string[] = [];

    for (const galleryName of galleries) {
      const { metaKey } = this.#galleryKeys(validGuildId, galleryName);
      if (metaKey) {
        metaKeys.push(metaKey);
        multi.hGetAll(metaKey);
      }
    }

    const results = (await multi.exec()) as unknown as Array<Record<string, string> | null>;
    const active: Gallery[] = [];
    const expiredOrMissing: Array<{ name: string; metaKey: string }> = [];

    for (let i = 0; i < galleries.length; i++) {
      const galleryName = galleries[i];
      const expiresAtStr = results[i]?.expiresAt;
      const expiresAt = expiresAtStr ? Number(expiresAtStr) : NaN;

      if (Number.isFinite(expiresAt) && expiresAt > now) {
        active.push({ name: galleryName, meta: this.#recordToMetadata(results[i]) });
      } else {
        const { metaKey } = this.#galleryKeys(validGuildId, galleryName);
        if (metaKey) {
          expiredOrMissing.push({ name: galleryName, metaKey });
        }
      }
    }

    if (expiredOrMissing.length > 0) {
      const cleanupMulti = redis.client.multi();
      for (const { name, metaKey } of expiredOrMissing) {
        const { memberKey } = this.#galleryKeys(validGuildId, name);
        cleanupMulti.sRem(listKey, name);
        cleanupMulti.del(metaKey);
        cleanupMulti.zRem(EXPIRES_ZSET, memberKey);
      }
      await cleanupMulti.exec();
    }

    return active;
  };

  createGallery = async (req: CreateGalleryRequest, userId: string) => {
    const validUserId = validateString(userId, "User ID is required");

    const result = createGallerySchema.safeParse(req);
    if (!result.success) {
      throw new InvalidInputError("Invalid gallery creation request");
    }

    const expiresAt = Date.now() + req.ttlWeeks * 7 * 24 * 60 * 60 * 1000;
    const { listKey, memberKey, metaKey } = this.#galleryKeys(req.guildId, req.galleryName);
    if (!metaKey) {
      throw new Error("Internal error: missing meta key");
    }

    const guildSet = await redis.client.sMembers(listKey);
    if (guildSet.includes(req.galleryName)) {
      throw new InvalidInputError("Gallery name already exists");
    }

    const meta = galleryMetaSchema.parse({
      createdAt: Date.now(),
      expiresAt,
      ttlWeeks: req.ttlWeeks,
      createdBy: validUserId,
    });

    const multi = redis.client.multi();
    multi.sAdd(listKey, req.galleryName);
    multi.hSet(metaKey, {
      createdAt: String(meta.createdAt),
      expiresAt: String(meta.expiresAt),
      ttlWeeks: String(meta.ttlWeeks),
      createdBy: meta.createdBy,
    });
    multi.zAdd(EXPIRES_ZSET, [{ score: expiresAt, value: memberKey }]);
    await multi.exec();

    await this.#bucketService.createBucketFolder(validateString(req.galleryName, GalleryNameError));

    return meta;
  };

  uploadToGallery = async (
    file: Express.Multer.File,
    galleryName: string,
    guildId: string,
    objectPath: string,
  ) => {
    // Single image upload
    if (
      this.#uploadService.isImageMime(file.mimetype) ||
      this.#uploadService.allowedImageExts.has(extname(file.originalname).toLowerCase())
    ) {
      const ext = extname(file.originalname).toLowerCase();
      const base = file.originalname.replace(ext, "");
      const objectName = this.#uploadService.buildObjectName(
        objectPath,
        `${Date.now()}-${base}${ext}`,
      );
      const contentType = file.mimetype || mimeFromExt(ext) || "application/octet-stream";

      await this.#bucketService.uploadBufferToBucket(galleryName, objectName, file.buffer, {
        "Content-Type": String(contentType),
        Name: base,
      });

      return {
        type: "sync" as const,
        uploaded: [{ key: objectName, contentType }],
      };
    }

    // ZIP upload - check if it's a ZIP file
    const isZipByExt = file.originalname.toLowerCase().endsWith(".zip");
    const isZipByMagic = this.#uploadService.looksLikeZip(file.buffer);
    const isZipByMime = this.#uploadService.isZipMime(file.mimetype);

    if (isZipByExt || isZipByMagic || isZipByMime) {
      appLogger.info(
        {
          guildId,
          galleryName,
          objectPath,
          originalName: file.originalname,
          size: file.size,
        },
        "[GalleryController.uploadToGallery] Received ZIP for async processing",
      );

      // Create an upload job for async processing
      const jobId = await this.#uploadJobService.createJob(
        guildId,
        galleryName,
        file.originalname,
        file.size,
      );

      appLogger.info(
        { jobId, guildId, galleryName, filename: file.originalname },
        "[GalleryController.uploadToGallery] Created upload job",
      );

      // Process ZIP file asynchronously (don't await)
      Promise.resolve().then(() => {
        this.#processZipUpload(jobId, file.buffer, galleryName, objectPath).catch(async (err) => {
          appLogger.error({ err, jobId }, "[uploadToGallery] Failed to process ZIP for job");
          // Ensure job is marked as failed if async processing throws
          try {
            await this.#uploadJobService.updateJobStatus(jobId, "failed", String(err));
          } catch (updateErr) {
            appLogger.error({ updateErr, jobId }, "[uploadToGallery] Failed to update job status");
          }
        });
      });

      return {
        type: "async" as const,
        jobId,
      };
    }

    throw new UnsupportedMimeTypeError();
  };

  #processZipUpload = async (
    jobId: string,
    buffer: Buffer,
    galleryName: string,
    objectPath: string,
  ) => {
    try {
      appLogger.info(
        { jobId, galleryName, objectPath, bufferSize: buffer.length },
        "[GalleryController.#processZipUpload] Starting ZIP processing",
      );
      await this.#uploadJobService.updateJobStatus(jobId, "processing");

      const uploaded: Array<{ key: string; contentType: string | false | null }> = [];
      const failed: Array<{ filename: string; error: string }> = [];
      let totalBytes = 0;
      let processedCount = 0; // Files actually processed (uploaded or failed)

      // Generate timestamp once for the entire batch to avoid collisions
      const timestamp = Date.now();

      const startedAt = Date.now();
      const MAX_PROCESSING_DURATION_MS = 5 * 60 * 1000; // 5 minutes

      const directory = await unzipper.Open.buffer(buffer);
      appLogger.info(
        { jobId, entryCount: directory.files.length },
        "[GalleryController.#processZipUpload] Opened ZIP directory",
      );

      if (!directory.files.length) {
        appLogger.warn({ jobId }, "[processZipUpload] ZIP archive contained no entries");
        await this.#uploadJobService.updateJobStatus(
          jobId,
          "failed",
          "ZIP contained no supported image files.",
        );
        await this.#uploadJobService.finalizeJob(jobId);
        return;
      }

      const imageEntries = directory.files.filter((entry) => {
        if (entry.type !== "File") return false;
        const ext = extname(entry.path || "").toLowerCase();
        return this.#uploadService.allowedImageExts.has(ext);
      });

      if (imageEntries.length === 0) {
        appLogger.warn(
          { jobId },
          "[processZipUpload] ZIP archive contained no supported image entries",
        );
        await this.#uploadJobService.updateJobStatus(
          jobId,
          "failed",
          "ZIP contained no supported image files.",
        );
        await this.#uploadJobService.finalizeJob(jobId);
        return;
      }

      if (imageEntries.length > MAX_ZIP_ENTRIES) {
        await this.#uploadJobService.updateJobStatus(
          jobId,
          "failed",
          "ZIP limits exceeded (too many files).",
        );
        await this.#uploadJobService.finalizeJob(jobId);
        return;
      }

      const totalImageFiles = imageEntries.length;

      let entriesSeen = 0;
      for (const entry of imageEntries) {
        entriesSeen += 1;
        if (entriesSeen === 1) {
          appLogger.info(
            { jobId, entryPath: entry.path, entryType: entry.type },
            "[GalleryController.#processZipUpload] First ZIP entry detected",
          );
        } else if (entriesSeen % 100 === 0) {
          appLogger.info(
            { jobId, entriesSeen },
            "[GalleryController.#processZipUpload] Processed 100 ZIP entries",
          );
        }

        if (Date.now() - startedAt > MAX_PROCESSING_DURATION_MS) {
          appLogger.error({ jobId, galleryName }, "[processZipUpload] ZIP processing timed out");
          await this.#uploadJobService.updateJobStatus(
            jobId,
            "failed",
            "ZIP processing timed out.",
          );
          await this.#uploadJobService.finalizeJob(jobId);
          return;
        }

        const entryPath = entry.path || "";
        const ext = extname(entryPath).toLowerCase();

        const size = entry.uncompressedSize ?? entry.extra?.uncompressedSize ?? 0;
        totalBytes += size;

        if (totalBytes > MAX_ZIP_UNCOMPRESSED_BYTES) {
          await this.#uploadJobService.updateJobStatus(
            jobId,
            "failed",
            "ZIP limits exceeded (too many files or total size too large).",
          );
          await this.#uploadJobService.finalizeJob(jobId);
          return;
        }

        const filename = entryPath.split("/").pop() || `file${ext}`;

        try {
          const contentType = mimeFromExt(ext) || "application/octet-stream";
          const objectName = this.#uploadService.buildObjectName(
            objectPath,
            `${timestamp}-${processedCount}-${filename}`,
          );

          const nodeStream = entry.stream();
          nodeStream.on("error", (err) => {
            appLogger.error(
              { err, jobId, filename },
              "[GalleryController.#processZipUpload] Entry stream error",
            );
          });

          await this.#bucketService.uploadStreamToBucket(
            galleryName,
            objectName,
            nodeStream,
            size || undefined,
            {
              "Content-Type": String(contentType),
            },
          );

          uploaded.push({ key: objectName, contentType });
          appLogger.info(
            { jobId, galleryName, objectName, filename, contentType },
            "[GalleryController.#processZipUpload] Uploaded file",
          );
        } catch (err) {
          appLogger.error({ err, jobId, filename }, "[processZipUpload] Failed to upload file");
          failed.push({ filename, error: String(err) });
          continue;
        }

        processedCount += 1;

        if (processedCount % PROGRESS_UPDATE_INTERVAL === 0) {
          // Send empty arrays for intermediate updates to minimize Redis payload size
          // Full file lists are only sent in the final progress update
          const progress: UploadJobProgress = {
            processedFiles: processedCount,
            totalFiles: totalImageFiles,
            uploadedFiles: [],
            failedFiles: [],
          };
          appLogger.info(
            { jobId, processedFiles: progress.processedFiles, totalFiles: progress.totalFiles },
            "[GalleryController.#processZipUpload] Updating intermediate progress",
          );
          void this.#uploadJobService.updateJobProgress(jobId, progress);
        }
      }

      // If no image entries were found at all, fail the job explicitly
      if (uploaded.length === 0) {
        appLogger.warn(
          { jobId, totalImageFiles, uploadedCount: uploaded.length },
          "[processZipUpload] ZIP contained no supported image files",
        );
        await this.#uploadJobService.updateJobStatus(
          jobId,
          "failed",
          "ZIP contained no supported image files.",
        );
        await this.#uploadJobService.finalizeJob(jobId);
        return;
      }

      // Final progress update with full details
      const finalProgress: UploadJobProgress = {
        processedFiles: processedCount,
        totalFiles: totalImageFiles,
        uploadedFiles: uploaded,
        failedFiles: failed,
      };
      await this.#uploadJobService.updateJobProgress(jobId, finalProgress);
      await this.#uploadJobService.updateJobStatus(jobId, "completed");
      appLogger.info(
        {
          jobId,
          galleryName,
          totalFiles: totalImageFiles,
          uploadedCount: uploaded.length,
          failedCount: failed.length,
        },
        "[GalleryController.#processZipUpload] Completed ZIP processing",
      );

      // Clean up job from list after completion
      await this.#uploadJobService.finalizeJob(jobId);
    } catch (err) {
      appLogger.error({ err, jobId }, "[processZipUpload] Error processing ZIP for job");
      await this.#uploadJobService.updateJobStatus(jobId, "failed", String(err));

      // Clean up job from list after failure
      try {
        await this.#uploadJobService.finalizeJob(jobId);
      } catch (cleanupErr) {
        appLogger.error({ cleanupErr, jobId }, "[processZipUpload] Failed to cleanup job");
      }
    }
  };

  getGalleryContents = async (name: string) => {
    const validatedName = validateString(name, GalleryNameError);
    console.log("Getting contents for gallery:", validatedName);
    const contents = await this.#bucketService.getBucketFolderContents(
      `${validatedName}/uploads`,
      true,
    );
    const filteredContents = contents.filter((item) => item.size && item.size > 0);
    return {
      gallery: name,
      count: filteredContents.length,
      contents: filteredContents,
    };
  };

  hasGallery = async (guildId: string, galleryName: string) => {
    const validGuildId = validateString(guildId, "Guild ID is required");
    const validGalleryName = validateString(galleryName, GalleryNameError);

    const { listKey, metaKey } = this.#galleryKeys(validGuildId, validGalleryName);
    if (!metaKey) {
      throw new Error("Internal error: missing meta key");
    }

    const multi = redis.client.multi();
    multi.sIsMember(listKey, validGalleryName);
    multi.hGet(metaKey, "expiresAt");

    const [exists, expiresAt] = await multi.exec();

    if (!exists) return false;

    const expiresAtNum = expiresAt ? Number(expiresAt) : NaN;
    if (Number.isFinite(expiresAtNum) && expiresAtNum > Date.now()) {
      return true;
    }

    return false;
  };

  renameGallery = async (guildId: string, oldName: string, newName: string) => {
    const validGuildId = validateString(guildId, "Guild ID is required");
    const validOldName = validateString(oldName, "Old gallery name is required");
    const validNewName = validateString(newName, "New gallery name is required");

    const multi = redis.client.multi();
    const {
      listKey,
      metaKey: oldMetaKey,
      memberKey: oldMemberKey,
    } = this.#galleryKeys(validGuildId, validOldName);
    const { metaKey: newMetaKey, memberKey: newMemberKey } = this.#galleryKeys(
      validGuildId,
      validNewName,
    );

    if (!oldMetaKey || !newMetaKey) {
      throw new Error("Internal error: missing meta key");
    }

    const guildSet = await redis.client.sMembers(listKey);
    if (!guildSet.includes(validOldName)) {
      throw new InvalidInputError("Old gallery does not exist");
    }
    if (guildSet.includes(validNewName)) {
      throw new InvalidInputError("New gallery name already exists");
    }

    multi.sRem(listKey, validOldName);
    multi.sAdd(listKey, validNewName);
    multi.rename(oldMetaKey, newMetaKey);
    multi.zRem(EXPIRES_ZSET, oldMemberKey);
    multi.zAdd(EXPIRES_ZSET, [{ score: 0, value: newMemberKey }]);
    await multi.exec();

    await this.#bucketService.renameBucketFolder(validOldName, validNewName);
  };

  removeGallery = async (guildId: string, galleryName: string) => {
    const validatedGuildId = validateString(guildId, "Guild ID is required");
    const validatedName = validateString(galleryName, GalleryNameError);

    const { listKey, memberKey, metaKey } = this.#galleryKeys(validatedGuildId, validatedName);
    if (!metaKey) {
      throw new Error("Internal error: missing meta key");
    }

    const multi = redis.client.multi();
    multi.sRem(listKey, validatedName);
    multi.del(metaKey);
    multi.zRem(EXPIRES_ZSET, memberKey);
    await multi.exec();

    await this.#bucketService.emptyBucketFolder(validatedName);
    await this.#bucketService.deleteBucketFolder(validatedName);
  };

  setDefaultGallery = async (body: SetDefaultGalleryRequest, userId: string) => {
    const validatedGuildId = validateString(body.guildId, "Guild ID is required");
    const validatedUserId = validateString(userId, "User ID is required");
    const validatedGalleryName = validateString(body.galleryName, "Gallery name is required");

    const key = `guild:${validatedGuildId}:user:${validatedUserId}:defaultGallery`;

    await redis.client.set(key, validatedGalleryName);

    return { defaultGallery: validatedGalleryName };
  };

  getUploadJob = async (jobId: string) => {
    const job = await this.#uploadJobService.getJob(jobId);
    if (!job) {
      throw new InvalidInputError("Upload job not found");
    }
    return job;
  };

  getImage = async (galleryName: string, imagePath: string) => {
    const validatedGalleryName = validateString(galleryName, GalleryNameError);
    const validatedImagePath = validateString(imagePath, ImagePathError);

    // Sanitize path to prevent traversal attacks
    const sanitizedImagePath = this.#uploadService.sanitizeKeySegment(validatedImagePath);

    // Build the full S3 key
    const key = `${validatedGalleryName}/uploads/${sanitizedImagePath}`;

    // Get the object from S3
    return await this.#bucketService.getObject(key);
  };
}
