export class UploadService {
  allowedImageExts: Set<string>;

  constructor() {
    this.allowedImageExts = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".heic"]);
  }

  isImageMime = (m: string) => m.startsWith("image/");

  isZipMime = (m: string) =>
    m === "application/zip" ||
    m === "application/x-zip-compressed" ||
    m === "multipart/x-zip" ||
    m === "application/octet-stream";

  sanitizeKeySegment = (s: string) => {
    // Very basic normalization: remove path traversal, normalize spaces, allow simple chars
    return s
      .replace(/\\/g, "/")
      .replace(/\.\.+/g, "") // remove traversal
      .replace(/[^a-zA-Z0-9._/-]+/g, "-")
      .replace(/\/+/g, "/")
      .replace(/^-+|-+$/g, "");
  };

  buildObjectName = (prefix: string, filename: string) => {
    const safePrefix = this.sanitizeKeySegment(prefix).replace(/\/+$/, "");
    const safeName = this.sanitizeKeySegment(filename);
    return safePrefix ? `${safePrefix}/${safeName}` : safeName;
  };
}
