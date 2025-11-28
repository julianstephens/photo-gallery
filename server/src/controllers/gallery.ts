import {
  createGallerySchema,
  galleryMetaSchema,
  type CreateGalleryRequest,
  type Gallery,
  type SetDefaultGalleryRequest,
} from "utils";
import { appLogger } from "../middleware/logger.ts";
import redis from "../redis.ts";
import { BucketService } from "../services/bucket.ts";
import { UploadService } from "../services/upload.ts";
import { InvalidInputError, normalizeGalleryFolderName, validateString } from "../utils.ts";

const EXPIRES_ZSET = "galleries:expiries:v2";

const GalleryNameError = "Gallery name cannot be empty";
const ImagePathError = "Image path is required";

export class GalleryController {
  #bucketService: BucketService;
  #uploadService: UploadService;

  constructor() {
    this.#bucketService = new BucketService();
    this.#uploadService = new UploadService();
  }

  #isAppleDoubleFile = (pathLike: string | undefined | null) => {
    if (!pathLike) return false;
    const normalized = pathLike.replace(/\\/g, "/");
    const segments = normalized.split("/");
    const filename = segments[segments.length - 1] ?? "";
    if (segments.includes("__MACOSX")) return true;
    if (filename.startsWith("._")) return true;
    const stripped = filename.replace(/^\d+-\d+-/, "");
    return stripped.startsWith("._");
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

  #getGalleryFolderName = async (guildId: string, galleryName: string) => {
    const validGuildId = validateString(guildId, "Guild ID is required");
    const validGalleryName = validateString(galleryName, GalleryNameError);

    const { metaKey } = this.#galleryKeys(validGuildId, validGalleryName);
    if (!metaKey) {
      throw new Error("Internal error: missing meta key");
    }

    const metadataJson = await redis.client.get(metaKey);
    if (!metadataJson) {
      throw new InvalidInputError("Gallery does not exist");
    }

    try {
      const metadata = JSON.parse(metadataJson);
      const folderName = metadata.folderName;
      if (folderName && folderName.trim().length > 0) {
        return folderName;
      }
    } catch (e) {
      appLogger.error({ error: e, metaKey, metadataJson }, "Failed to parse gallery metadata");
    }

    // If folderName doesn't exist or parse failed, return the gallery name as default
    return validGalleryName;
  };

  listGalleries = async (guildId: string) => {
    const validGuildId = validateString(guildId, "Guild ID is required");

    const { listKey } = this.#galleryKeys(validGuildId);
    const galleries = await redis.client.sMembers(listKey);
    if (!galleries || galleries.length === 0) return [];

    const now = Date.now();
    const metaKeys: string[] = [];

    for (const galleryName of galleries) {
      const { metaKey } = this.#galleryKeys(validGuildId, galleryName);
      if (metaKey) {
        metaKeys.push(metaKey);
      }
    }

    const results = await redis.client.mGet(metaKeys);
    const active: Gallery[] = [];
    const expiredOrMissing: Array<{ name: string; metaKey: string }> = [];

    for (let i = 0; i < galleries.length; i++) {
      const galleryName = galleries[i];
      const metadataJson = results[i];

      if (!metadataJson) {
        const { metaKey } = this.#galleryKeys(validGuildId, galleryName);
        if (metaKey) {
          expiredOrMissing.push({ name: galleryName, metaKey });
        }
        continue;
      }

      try {
        const metadata = JSON.parse(metadataJson);
        const expiresAt = metadata.expiresAt;

        if (Number.isFinite(expiresAt) && expiresAt > now) {
          active.push({ name: galleryName, meta: metadata });
        } else {
          const { metaKey } = this.#galleryKeys(validGuildId, galleryName);
          if (metaKey) {
            expiredOrMissing.push({ name: galleryName, metaKey });
          }
        }
      } catch (e) {
        appLogger.error(
          { error: e, galleryName, metadataJson },
          "Failed to parse gallery metadata in listGalleries",
        );
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

  getSingleGallery = async (guildId: string, galleryName: string) => {
    const validGuildId = validateString(guildId, "Guild ID is required");
    const validGalleryName = validateString(galleryName, GalleryNameError);

    const { metaKey } = this.#galleryKeys(validGuildId, validGalleryName);
    if (!metaKey) {
      throw new Error("Internal error: missing meta key");
    }

    const metadataJson = await redis.client.get(metaKey);
    if (!metadataJson) {
      throw new InvalidInputError("Gallery does not exist");
    }

    try {
      const metadata = JSON.parse(metadataJson);
      const now = Date.now();
      const expiresAt = metadata.expiresAt;

      if (!Number.isFinite(expiresAt) || expiresAt <= now) {
        throw new InvalidInputError("Gallery has expired");
      }

      return { name: validGalleryName, meta: metadata };
    } catch (e) {
      if (e instanceof InvalidInputError) {
        throw e;
      }
      appLogger.error(
        { error: e, galleryName: validGalleryName, metadataJson },
        "Failed to parse gallery metadata in getSingleGallery",
      );
      throw new InvalidInputError("Failed to retrieve gallery");
    }
  };

  createGallery = async (req: CreateGalleryRequest, userId: string) => {
    const validUserId = validateString(userId, "User ID is required");
    const validatedGalleryName = validateString(req.galleryName, GalleryNameError);

    const result = createGallerySchema.safeParse(req);
    if (!result.success) {
      throw new InvalidInputError("Invalid gallery creation request");
    }

    const expiresAt = Date.now() + req.ttlWeeks * 7 * 24 * 60 * 60 * 1000;
    const { listKey, memberKey, metaKey } = this.#galleryKeys(req.guildId, validatedGalleryName);
    if (!metaKey) {
      throw new Error("Internal error: missing meta key");
    }

    const guildSet = await redis.client.sMembers(listKey);
    if (guildSet.includes(validatedGalleryName)) {
      throw new InvalidInputError("Gallery name already exists");
    }

    const folderName = normalizeGalleryFolderName(validatedGalleryName);
    const hasFolderCollision = guildSet.some(
      (name) => normalizeGalleryFolderName(name) === folderName,
    );
    if (hasFolderCollision) {
      throw new InvalidInputError("A gallery with this folder already exists");
    }

    const meta = galleryMetaSchema.parse({
      createdAt: Date.now(),
      expiresAt,
      ttlWeeks: req.ttlWeeks,
      createdBy: validUserId,
      folderName,
      totalItems: 0,
    });

    const multi = redis.client.multi();
    multi.sAdd(listKey, validatedGalleryName);
    multi.set(metaKey, JSON.stringify(meta));
    multi.zAdd(EXPIRES_ZSET, [{ score: expiresAt, value: memberKey }]);
    await multi.exec();

    await this.#bucketService.createBucketFolder(meta.folderName ?? folderName);

    return meta;
  };

  getGalleryContents = async (guildId: string, name: string) => {
    const validatedName = validateString(name, GalleryNameError);
    const folderName = await this.#getGalleryFolderName(guildId, validatedName);

    appLogger.debug(
      { guildId, galleryName: name, folderName },
      "[getGalleryContents] Starting to fetch gallery contents",
    );

    // Try to get contents from the uploads subdirectory first
    let contents = await this.#bucketService.getBucketFolderContents(`${folderName}/uploads`, true);

    appLogger.debug(
      {
        guildId,
        galleryName: name,
        uploadsPath: `${folderName}/uploads`,
        fileCount: contents.length,
      },
      "[getGalleryContents] Files found in uploads subdirectory",
    );

    // If no files found in uploads subdirectory, try root gallery folder
    if (contents.length === 0) {
      contents = await this.#bucketService.getBucketFolderContents(folderName, true);
      appLogger.debug(
        { guildId, galleryName: name, rootPath: folderName, fileCount: contents.length },
        "[getGalleryContents] Files found in root gallery folder (fallback)",
      );
    }

    const filteredContents = contents.filter((item) => {
      // Only count files, not folders, and exclude metadata/system files
      const isValid =
        item.size &&
        item.size > 0 &&
        !this.#isAppleDoubleFile(item.name) &&
        !item.name?.endsWith("/");
      if (!isValid) {
        appLogger.debug(
          {
            guildId,
            galleryName: name,
            itemName: item.name,
            itemSize: item.size,
            isAppleDouble: this.#isAppleDoubleFile(item.name),
            endsWithSlash: item.name?.endsWith("/"),
          },
          "[getGalleryContents] Filtering out invalid item",
        );
      }
      return isValid;
    });

    appLogger.debug(
      {
        guildId,
        galleryName: name,
        totalFiles: contents.length,
        filteredCount: filteredContents.length,
      },
      "[getGalleryContents] Final filtered count",
    );

    return {
      gallery: name,
      count: filteredContents.length,
      contents: filteredContents,
    };
  };

  #syncGalleryItemCount = async (guildId: string, galleryName: string) => {
    try {
      const { metaKey } = this.#galleryKeys(guildId, galleryName);
      if (!metaKey) {
        appLogger.warn(
          { guildId, galleryName },
          "[syncGalleryItemCount] Missing meta key, skipping sync",
        );
        return;
      }

      const metadataJson = await redis.client.get(metaKey);
      if (!metadataJson) {
        appLogger.warn(
          { guildId, galleryName },
          "[syncGalleryItemCount] Gallery metadata not found, skipping sync",
        );
        return;
      }

      const metadata = JSON.parse(metadataJson);
      appLogger.debug(
        { guildId, galleryName, currentTotalItems: metadata.totalItems },
        "[syncGalleryItemCount] Current metadata totalItems before sync",
      );

      const { count } = await this.getGalleryContents(guildId, galleryName);
      metadata.totalItems = count;

      await redis.client.set(metaKey, JSON.stringify(metadata));
      appLogger.debug(
        { guildId, galleryName, totalItems: count },
        "[syncGalleryItemCount] Gallery item count synced",
      );
    } catch (error) {
      appLogger.error(
        { error, guildId, galleryName },
        "[syncGalleryItemCount] Failed to sync gallery item count",
      );
    }
  };

  syncGalleryItemCount = async (guildId: string, galleryName: string) => {
    await this.#syncGalleryItemCount(guildId, galleryName);
  };

  incrementGalleryItemCount = async (guildId: string, galleryName: string, count: number = 1) => {
    try {
      const validGuildId = validateString(guildId, "Guild ID is required");
      const validGalleryName = validateString(galleryName, GalleryNameError);

      const { metaKey } = this.#galleryKeys(validGuildId, validGalleryName);
      if (!metaKey) {
        appLogger.warn(
          { guildId: validGuildId, galleryName: validGalleryName },
          "[incrementGalleryItemCount] Missing meta key, skipping increment",
        );
        return;
      }

      const metadataJson = await redis.client.get(metaKey);
      if (!metadataJson) {
        appLogger.warn(
          { guildId: validGuildId, galleryName: validGalleryName },
          "[incrementGalleryItemCount] Gallery metadata not found, skipping increment",
        );
        return;
      }

      const metadata = JSON.parse(metadataJson);
      const previousCount = metadata.totalItems ?? 0;
      metadata.totalItems = previousCount + count;

      await redis.client.set(metaKey, JSON.stringify(metadata));
      appLogger.debug(
        {
          guildId: validGuildId,
          galleryName: validGalleryName,
          previousCount,
          increment: count,
          newTotal: metadata.totalItems,
        },
        "[incrementGalleryItemCount] Gallery item count incremented",
      );
    } catch (error) {
      appLogger.error(
        { error, guildId, galleryName, count },
        "[incrementGalleryItemCount] Failed to increment gallery item count",
      );
    }
  };

  getGalleryFolderName = async (guildId: string, galleryName: string): Promise<string> => {
    return await this.#getGalleryFolderName(guildId, galleryName);
  };

  hasGallery = async (guildId: string, galleryName: string) => {
    const validGuildId = validateString(guildId, "Guild ID is required");
    const validGalleryName = validateString(galleryName, GalleryNameError);

    const { metaKey } = this.#galleryKeys(validGuildId, validGalleryName);
    if (!metaKey) {
      throw new Error("Internal error: missing meta key");
    }

    // Simply check if the metadata key exists and is valid
    try {
      const meta = await redis.client.get(metaKey);
      if (!meta) return false;

      const parsedMeta = JSON.parse(meta);
      const expiresAtNum = parsedMeta.expiresAt ? Number(parsedMeta.expiresAt) : NaN;
      if (Number.isFinite(expiresAtNum) && expiresAtNum > Date.now()) {
        return true;
      }
    } catch (error) {
      // If there's any error reading/parsing metadata, consider it doesn't exist
      appLogger.warn({ error, metaKey }, "[hasGallery] Error checking gallery");
      return false;
    }

    return false;
  };

  renameGallery = async (guildId: string, oldName: string, newName: string) => {
    const validGuildId = validateString(guildId, "Guild ID is required");
    const validOldName = validateString(oldName, "Old gallery name is required");
    const validNewName = validateString(newName, "New gallery name is required");

    appLogger.debug(
      { guildId: validGuildId, oldName: validOldName, newName: validNewName },
      "[renameGallery] Starting gallery rename operation",
    );

    const currentFolderName = await this.#getGalleryFolderName(validGuildId, validOldName);
    const newFolderName = normalizeGalleryFolderName(validNewName);

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

    appLogger.debug(
      { guildId: validGuildId, oldMetaKey, newMetaKey, oldMemberKey, newMemberKey },
      "[renameGallery] Computed Redis keys",
    );

    // Validate gallery exists and new name is available
    const guildSet = await redis.client.sMembers(listKey);
    if (!guildSet.includes(validOldName)) {
      appLogger.warn(
        { guildId: validGuildId, oldName: validOldName, galleryNames: guildSet },
        "[renameGallery] Old gallery not found in set",
      );
      throw new InvalidInputError("Old gallery does not exist");
    }
    if (guildSet.includes(validNewName)) {
      throw new InvalidInputError("New gallery name already exists");
    }
    const folderCollision = guildSet
      .filter((name) => name !== validOldName)
      .some((name) => normalizeGalleryFolderName(name) === newFolderName);
    if (folderCollision) {
      throw new InvalidInputError("A gallery with this folder already exists");
    }

    appLogger.debug(
      { guildId: validGuildId, oldName: validOldName, newName: validNewName },
      "[renameGallery] Validation passed, proceeding with rename",
    );

    // Fetch the old metadata before renaming
    const oldMetadataJson = await redis.client.get(oldMetaKey);
    if (!oldMetadataJson) {
      appLogger.error(
        { guildId: validGuildId, oldName: validOldName, oldMetaKey },
        "[renameGallery] Gallery metadata not found in Redis",
      );
      throw new InvalidInputError("Gallery metadata not found");
    }

    let metadata;
    try {
      metadata = JSON.parse(oldMetadataJson);
      appLogger.debug(
        { guildId: validGuildId, oldName: validOldName, metadataKeys: Object.keys(metadata) },
        "[renameGallery] Successfully parsed old metadata",
      );
    } catch (e) {
      appLogger.error(
        { error: e, oldMetaKey, oldMetadataJson },
        "[renameGallery] Failed to parse gallery metadata",
      );
      throw new Error("Failed to parse gallery metadata");
    }

    // Update the folder name in metadata
    metadata.folderName = newFolderName;

    const expiryScore = metadata.expiresAt;
    appLogger.debug(
      {
        guildId: validGuildId,
        oldName: validOldName,
        newName: validNewName,
        expiryScore,
        expiryDate: new Date(expiryScore),
      },
      "[renameGallery] Extracted expiry score from metadata",
    );

    if (!Number.isFinite(expiryScore)) {
      appLogger.error(
        { guildId: validGuildId, oldName: validOldName, expiryScore },
        "[renameGallery] Invalid expiry score in metadata",
      );
      throw new Error("Invalid expiry score in gallery metadata");
    }

    // Execute all Redis operations in a single atomic transaction
    appLogger.debug(
      { guildId: validGuildId, oldName: validOldName, newName: validNewName },
      "[renameGallery] Starting Redis transaction",
    );

    const multi = redis.client.multi();

    // Remove old gallery name from the set
    multi.sRem(listKey, validOldName);
    appLogger.debug({}, "[renameGallery] Queued: sRem old name from set");

    // Add new gallery name to the set
    multi.sAdd(listKey, validNewName);
    appLogger.debug({}, "[renameGallery] Queued: sAdd new name to set");

    // Delete old metadata key
    multi.del(oldMetaKey);
    appLogger.debug({}, "[renameGallery] Queued: del old metadata key");

    // Set new metadata key with updated data
    multi.set(newMetaKey, JSON.stringify(metadata));
    appLogger.debug({}, "[renameGallery] Queued: set new metadata key");

    // Remove old expiry entry from sorted set
    multi.zRem(EXPIRES_ZSET, oldMemberKey);
    appLogger.debug({}, "[renameGallery] Queued: zRem old member from EXPIRES_ZSET");

    // Add new expiry entry to sorted set with same score
    multi.zAdd(EXPIRES_ZSET, [{ score: expiryScore, value: newMemberKey }]);
    appLogger.debug({}, "[renameGallery] Queued: zAdd new member to EXPIRES_ZSET");

    const results = await multi.exec();

    appLogger.debug(
      {
        guildId: validGuildId,
        oldName: validOldName,
        newName: validNewName,
        resultCount: results?.length,
        results,
      },
      "[renameGallery] Redis transaction executed",
    );

    if (!results || results.length !== 6) {
      appLogger.error(
        {
          guildId: validGuildId,
          oldName: validOldName,
          newName: validNewName,
          resultCount: results?.length,
        },
        "[renameGallery] Redis transaction failed - unexpected number of results",
      );
      throw new Error("Failed to execute rename transaction");
    }

    // Verify all operations succeeded
    const [sRemResult, sAddResult, delResult, setResult, zRemResult, zAddResult] = results;
    appLogger.debug(
      { sRemResult, sAddResult, delResult, setResult, zRemResult, zAddResult },
      "[renameGallery] Individual operation results from transaction",
    );

    // Post-transaction verification
    appLogger.debug(
      { guildId: validGuildId, oldName: validOldName, newName: validNewName },
      "[renameGallery] Starting post-transaction verification",
    );

    // Verify new metadata exists
    const newMetadataJson = await redis.client.get(newMetaKey);
    if (!newMetadataJson) {
      appLogger.error(
        { guildId: validGuildId, oldName: validOldName, newName: validNewName, newMetaKey },
        "[renameGallery] CRITICAL: New metadata key not found after transaction",
      );
      throw new Error("Failed to rename gallery - metadata verification failed");
    }

    appLogger.debug(
      { guildId: validGuildId, newName: validNewName, newMetaKey },
      "[renameGallery] Verified: New metadata key exists",
    );

    // Verify old metadata is deleted
    const oldMetadataCheck = await redis.client.get(oldMetaKey);
    if (oldMetadataCheck) {
      appLogger.warn(
        { guildId: validGuildId, oldName: validOldName, oldMetaKey },
        "[renameGallery] WARNING: Old metadata key still exists",
      );
    } else {
      appLogger.debug(
        { guildId: validGuildId, oldName: validOldName, oldMetaKey },
        "[renameGallery] Verified: Old metadata key deleted",
      );
    }

    // Verify new gallery name is in the set
    const newGalleryInSet = await redis.client.sIsMember(listKey, validNewName);
    appLogger.debug(
      { guildId: validGuildId, newName: validNewName, inSet: newGalleryInSet },
      "[renameGallery] Verified new gallery name in set",
    );

    // Verify old gallery name is removed from set
    const oldGalleryInSet = await redis.client.sIsMember(listKey, validOldName);
    if (oldGalleryInSet) {
      appLogger.warn(
        { guildId: validGuildId, oldName: validOldName },
        "[renameGallery] WARNING: Old gallery name still in set",
      );
    } else {
      appLogger.debug(
        { guildId: validGuildId, oldName: validOldName },
        "[renameGallery] Verified old gallery name removed from set",
      );
    }

    // Verify ZSET entries
    const newZSetScore = await redis.client.zScore(EXPIRES_ZSET, newMemberKey);
    const oldZSetScore = await redis.client.zScore(EXPIRES_ZSET, oldMemberKey);

    appLogger.debug(
      {
        guildId: validGuildId,
        oldName: validOldName,
        newName: validNewName,
        newMemberKey,
        oldMemberKey,
        newZSetScore,
        oldZSetScore,
        expectedScore: expiryScore,
      },
      "[renameGallery] ZSET verification after transaction",
    );

    if (!Number.isFinite(newZSetScore)) {
      appLogger.error(
        { guildId: validGuildId, newName: validNewName, newMemberKey, newZSetScore },
        "[renameGallery] CRITICAL: New member not in EXPIRES_ZSET or has invalid score",
      );
      throw new Error("Failed to rename gallery - ZSET verification failed");
    }

    if (newZSetScore !== expiryScore) {
      appLogger.warn(
        { guildId: validGuildId, newZSetScore, expectedScore: expiryScore },
        "[renameGallery] WARNING: ZSET score mismatch",
      );
    }

    if (oldZSetScore !== null && oldZSetScore !== undefined) {
      appLogger.warn(
        { guildId: validGuildId, oldName: validOldName, oldMemberKey, oldZSetScore },
        "[renameGallery] WARNING: Old member still in EXPIRES_ZSET",
      );
    } else {
      appLogger.debug(
        { guildId: validGuildId, oldName: validOldName, oldMemberKey },
        "[renameGallery] Verified old member removed from EXPIRES_ZSET",
      );
    }

    appLogger.debug(
      { guildId: validGuildId, oldName: validOldName, newName: validNewName },
      "[renameGallery] Post-transaction verification completed successfully",
    );

    // Rename the bucket folder
    appLogger.debug(
      { currentFolderName, newFolderName },
      "[renameGallery] Starting bucket folder rename",
    );

    await this.#bucketService.renameBucketFolder(currentFolderName, newFolderName);

    appLogger.debug(
      { currentFolderName, newFolderName },
      "[renameGallery] Bucket folder renamed successfully",
    );

    appLogger.info(
      { guildId: validGuildId, oldName: validOldName, newName: validNewName },
      "[renameGallery] Gallery rename operation completed successfully",
    );
  };

  removeGallery = async (guildId: string, galleryName: string) => {
    const validatedGuildId = validateString(guildId, "Guild ID is required");
    const validatedName = validateString(galleryName, GalleryNameError);
    const folderName = await this.#getGalleryFolderName(validatedGuildId, validatedName);

    const { listKey, memberKey, metaKey } = this.#galleryKeys(validatedGuildId, validatedName);
    if (!metaKey) {
      throw new Error("Internal error: missing meta key");
    }

    const multi = redis.client.multi();
    multi.sRem(listKey, validatedName);
    multi.del(metaKey);
    multi.zRem(EXPIRES_ZSET, memberKey);
    await multi.exec();

    await this.#bucketService.emptyBucketFolder(folderName);
    await this.#bucketService.deleteBucketFolder(folderName);
  };

  setDefaultGallery = async (body: SetDefaultGalleryRequest, userId: string) => {
    const validatedGuildId = validateString(body.guildId, "Guild ID is required");
    const validatedUserId = validateString(userId, "User ID is required");
    const validatedGalleryName = validateString(body.galleryName, "Gallery name is required");

    const key = `guild:${validatedGuildId}:user:${validatedUserId}:defaultGallery`;

    await redis.client.set(key, validatedGalleryName);

    return { defaultGallery: validatedGalleryName };
  };

  getImage = async (guildId: string, galleryName: string, imagePath: string) => {
    const validatedGalleryName = validateString(galleryName, GalleryNameError);
    const folderName = await this.#getGalleryFolderName(guildId, validatedGalleryName);
    const validatedImagePath = validateString(imagePath, ImagePathError);

    // Sanitize path to prevent traversal attacks
    const sanitizedImagePath = this.#uploadService.sanitizeKeySegment(validatedImagePath);

    // Build the full S3 key
    const key = `${folderName}/uploads/${sanitizedImagePath}`;

    // Get the object from S3
    return await this.#bucketService.getObject(key);
  };
}
