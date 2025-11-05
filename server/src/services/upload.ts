export class UploadService {
  allowedImageExts: Set<string>;

  constructor() {
    this.allowedImageExts = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".heic"]);
  }

  isImageMime = (m: string) => m.startsWith("image/");

  isZipMime = (m: string) =>
    m === "application/zip" || m === "application/x-zip-compressed" || m === "multipart/x-zip";

  // Magic bytes check for ZIP: "PK\x03\x04" (normal), "PK\x05\x06" (empty archive), "PK\x07\x08" (spanned)
  looksLikeZip = (buf: Buffer) => {
    if (!buf || buf.length < 4) return false;
    const sig = buf.subarray(0, 4).toString("binary");
    return sig === "PK\u0003\u0004" || sig === "PK\u0005\u0006" || sig === "PK\u0007\u0008";
  };

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
