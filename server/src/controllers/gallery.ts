import { lookup as mimeFromExt } from "mime-types";
import { extname } from "path";
import { type Readable } from "stream";
import unzipper from "unzipper";
import {
  createGallerySchema,
  galleryMetaSchema,
  type CreateGalleryRequest,
  type Gallery,
} from "utils";
import redis from "../redis.ts";
import { BucketService } from "../services/bucket.ts";
import { UploadService } from "../services/upload.ts";

const EXPIRES_ZSET = "galleries:expiries";

// Narrow type for entries produced by unzipper.Parse() to avoid `any`
type ZipEntry = NodeJS.ReadableStream & {
  path: string;
  type: "File" | "Directory";
  autodrain: () => void;
  vars?: { uncompressedSize?: number };
};

class InvalidInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidInputError";
  }
}

class UnsupportedMimeTypeError extends Error {
  constructor() {
    super("Unsupported file type. Upload an image/* or a .zip of images.");
    this.name = "UnsupportedMimeTypeError";
  }
}

const GalleryNameError = "Gallery name cannot be empty";
const MAX_ZIP_ENTRIES = 1000;
const MAX_ZIP_UNCOMPRESSED_BYTES = 500 * 1024 * 1024; // 500 MB guardrail

export class GalleryController {
  #bucketService: BucketService;
  #uploadService: UploadService;

  constructor() {
    this.#bucketService = new BucketService();
    this.#uploadService = new UploadService();
  }

  #validateString = (value: string, errorMessage?: string) => {
    if (!value || value.trim() === "") {
      throw new InvalidInputError(errorMessage ?? "Input string cannot be empty");
    }
    return value.trim();
  };

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

  // #resolveGuild = (guild?: string) => {
  //   // 1. get all guilds the user is in
  //   // 2. if guild param is provided, check user is in that guild
  //   // 3. if no guild param, use primary guild
  //   // 4. if no primary guild, error
  //   // 5. return guild id
  // };

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
    const validGuildId = this.#validateString(guildId, "Guild ID is required");

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
    const validUserId = this.#validateString(userId, "User ID is required");

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

    await this.#bucketService.createBucketFolder(
      this.#validateString(req.galleryName, GalleryNameError),
    );

    return meta;
  };

  uploadToGallery = async (file: Express.Multer.File, bucket: string, nowPrefix: string) => {
    // Single image upload
    if (
      this.#uploadService.isImageMime(file.mimetype) ||
      this.#uploadService.allowedImageExts.has(extname(file.originalname).toLowerCase())
    ) {
      const ext = extname(file.originalname).toLowerCase();
      const base = file.originalname.replace(ext, "");
      const objectName = this.#uploadService.buildObjectName(
        nowPrefix,
        `${Date.now()}-${base}${ext}`,
      );
      const contentType = file.mimetype || mimeFromExt(ext) || "application/octet-stream";

      await this.#bucketService.uploadBufferToBucket(bucket, objectName, file.buffer, {
        "Content-Type": String(contentType),
      });

      return {
        uploaded: [{ key: objectName, contentType }],
      };
    }

    // ZIP upload
    const isZipByExt = file.originalname.toLowerCase().endsWith(".zip");
    const isZipByMagic = this.#uploadService.looksLikeZip(file.buffer);
    const isZipByMime = this.#uploadService.isZipMime(file.mimetype);

    if (isZipByExt || isZipByMagic || isZipByMime) {
      const uploaded: Array<{ key: string; contentType: string | false | null }> = [];
      let totalBytes = 0;
      let count = 0;

      const zipStream = unzipper.Parse();

      // Create a stream from the in-memory buffer
      const { Readable } = await import("stream");
      const src = Readable.from(file.buffer);
      src.pipe(zipStream);

      // Consume entries sequentially
      for await (const entry of zipStream as AsyncIterable<ZipEntry>) {
        const entryPath: string = entry.path || "";
        const type: string = entry.type || "File";
        if (type !== "File") {
          entry.autodrain();
          continue;
        }

        const ext = extname(entryPath).toLowerCase();
        if (!this.#uploadService.allowedImageExts.has(ext)) {
          entry.autodrain();
          continue;
        }

        const size = entry.vars?.uncompressedSize ?? 0;
        totalBytes += size;
        count += 1;
        if (count > MAX_ZIP_ENTRIES || totalBytes > MAX_ZIP_UNCOMPRESSED_BYTES) {
          // Drain remaining entries, then bail
          entry.autodrain();

          for await (const rest of zipStream as AsyncIterable<ZipEntry>) {
            rest.autodrain();
          }
          throw new InvalidInputError(
            "ZIP limits exceeded (too many files or total size too large).",
          );
        }

        const contentType = mimeFromExt(ext) || "application/octet-stream";
        const filename = entryPath.split("/").pop() || `file${ext}`;
        const objectName = this.#uploadService.buildObjectName(
          nowPrefix,
          `${Date.now()}-${filename}`,
        );

        // normalize to a Node.js Readable without using `any`
        const hasPipe = typeof (entry as { pipe?: unknown }).pipe === "function";
        const nodeStream = hasPipe
          ? (entry as unknown as Readable)
          : Readable.fromWeb(entry as unknown as globalThis.ReadableStream<Uint8Array>);

        await this.#bucketService.uploadStreamToBucket(
          bucket,
          objectName,
          nodeStream,
          size || undefined,
          {
            "Content-Type": String(contentType),
          },
        );

        uploaded.push({ key: objectName, contentType });
      }

      if (uploaded.length === 0) {
        throw new InvalidInputError("ZIP contained no supported image files.");
      }

      return { uploaded };
    }

    throw new UnsupportedMimeTypeError();
  };

  getGalleryContents = async (name: string) => {
    const contents = await this.#bucketService.getBucketFolderContents(
      this.#validateString(name, GalleryNameError),
    );
    return {
      gallery: name,
      count: contents.length,
      contents,
    };
  };

  hasGallery = async (guildId: string, galleryName: string) => {
    const validGuildId = this.#validateString(guildId, "Guild ID is required");
    const validGalleryName = this.#validateString(galleryName, GalleryNameError);

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
    const validGuildId = this.#validateString(guildId, "Guild ID is required");
    const validOldName = this.#validateString(oldName, "Old gallery name is required");
    const validNewName = this.#validateString(newName, "New gallery name is required");

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
    const validatedGuildId = this.#validateString(guildId, "Guild ID is required");
    const validatedName = this.#validateString(galleryName, GalleryNameError);

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
}
