export class UploadService {
  allowedImageExts: Set<string>;

  constructor() {
    this.allowedImageExts = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".heic"]);
  }

  isImageMime = (m: string) => m.startsWith("image/");

  sanitizeKeySegment = (s: string) => {
    return s
      .replace(/\\/g, "/")
      .replace(/\.\.+/g, "")
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
