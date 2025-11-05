import { lookup as mimeFromExt } from "mime-types";
import { extname } from "path";
import unzipper from "unzipper";
import { BucketService } from "../services/bucket.ts";
import { UploadService } from "../services/upload.ts";

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
const MAX_ZIP_ENTRIES = 1000; // guardrail
const MAX_ZIP_UNCOMPRESSED_BYTES = 500 * 1024 * 1024; // 500 MB guardrail

export class GalleryAPI {
  _bucketService: BucketService;
  _uploadService: UploadService;

  constructor() {
    this._bucketService = new BucketService();
    this._uploadService = new UploadService();
  }

  #validateString = (value: string, errorMessage?: string) => {
    if (!value || value.trim() === "") {
      throw new InvalidInputError(errorMessage ?? "Input string cannot be empty");
    }
    return value.trim();
  };

  createGallery = async (name: string) => {
    await this._bucketService.createBucket(this.#validateString(name, GalleryNameError));
  };

  uploadToGallery = async (file: Express.Multer.File, bucket: string, nowPrefix: string) => {
    // Single image upload
    if (
      this._uploadService.isImageMime(file.mimetype) ||
      this._uploadService.allowedImageExts.has(extname(file.originalname).toLowerCase())
    ) {
      const ext = extname(file.originalname).toLowerCase();
      const base = file.originalname.replace(ext, "");
      const objectName = this._uploadService.buildObjectName(
        nowPrefix,
        `${Date.now()}-${base}${ext}`,
      );
      const contentType = file.mimetype || mimeFromExt(ext) || "application/octet-stream";

      await this._bucketService.uploadBufferToBucket(bucket, objectName, file.buffer, {
        "Content-Type": String(contentType),
      });

      return {
        uploaded: [{ key: objectName, contentType }],
      };
    }

    // ZIP upload
    const isZipByExt = file.originalname.toLowerCase().endsWith(".zip");
    const isZipByMagic = this._uploadService.looksLikeZip(file.buffer);
    const isZipByMime = this._uploadService.isZipMime(file.mimetype);

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
        if (!this._uploadService.allowedImageExts.has(ext)) {
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
        const objectName = this._uploadService.buildObjectName(
          nowPrefix,
          `${Date.now()}-${filename}`,
        );

        await this._bucketService.uploadStreamToBucket(
          bucket,
          objectName,
          entry,
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
    const contents = await this._bucketService.getBucketContents(
      this.#validateString(name, GalleryNameError),
    );
    return {
      gallery: name,
      count: contents.length,
      contents,
    };
  };

  removeGallery = async (name: string) => {
    const validatedName = this.#validateString(name, GalleryNameError);
    await this._bucketService.emptyBucket(validatedName);
    await this._bucketService.deleteBucket(validatedName);
  };
}
