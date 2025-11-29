import { describe, it, expect, beforeEach } from "vitest";
import { UploadService } from "./upload.ts";

describe("UploadService", () => {
  let service: UploadService;

  beforeEach(() => {
    service = new UploadService();
  });

  describe("isImageMime", () => {
    it("should return true for valid image MIME types", () => {
      expect(service.isImageMime("image/jpeg")).toBe(true);
      expect(service.isImageMime("image/png")).toBe(true);
      expect(service.isImageMime("image/webp")).toBe(true);
      expect(service.isImageMime("image/gif")).toBe(true);
    });

    it("should return false for non-image MIME types", () => {
      expect(service.isImageMime("application/pdf")).toBe(false);
      expect(service.isImageMime("text/plain")).toBe(false);
      expect(service.isImageMime("video/mp4")).toBe(false);
    });
  });

  describe("sanitizeKeySegment", () => {
    it("should sanitize path traversal attempts", () => {
      expect(service.sanitizeKeySegment("../../../etc/passwd")).toBe("/etc/passwd");
      expect(service.sanitizeKeySegment("foo/../bar")).toBe("foo/bar");
    });

    it("should normalize backslashes to forward slashes", () => {
      expect(service.sanitizeKeySegment("foo\\bar\\baz")).toBe("foo/bar/baz");
    });

    it("should replace special characters with hyphens", () => {
      expect(service.sanitizeKeySegment("foo@#$%bar")).toBe("foo-bar");
      expect(service.sanitizeKeySegment("test file name")).toBe("test-file-name");
    });

    it("should remove leading and trailing hyphens", () => {
      expect(service.sanitizeKeySegment("---foo---")).toBe("foo");
      expect(service.sanitizeKeySegment("@@@bar@@@")).toBe("bar");
    });

    it("should normalize multiple consecutive slashes", () => {
      expect(service.sanitizeKeySegment("foo///bar")).toBe("foo/bar");
    });

    it("should preserve allowed characters", () => {
      expect(service.sanitizeKeySegment("file-name_123.ext")).toBe("file-name_123.ext");
      expect(service.sanitizeKeySegment("path/to/file.jpg")).toBe("path/to/file.jpg");
    });
  });

  describe("buildObjectName", () => {
    it("should build object name with prefix", () => {
      const result = service.buildObjectName("uploads/2025-11-05", "image.jpg");
      expect(result).toBe("uploads/2025-11-05/image.jpg");
    });

    it("should sanitize both prefix and filename", () => {
      const result = service.buildObjectName("../bad/path", "test@file.jpg");
      expect(result).toBe("/bad/path/test-file.jpg");
    });

    it("should handle empty prefix", () => {
      const result = service.buildObjectName("", "image.jpg");
      expect(result).toBe("image.jpg");
    });

    it("should remove trailing slashes from prefix", () => {
      const result = service.buildObjectName("uploads///", "image.jpg");
      expect(result).toBe("uploads/image.jpg");
    });

    it("should handle complex filenames", () => {
      const result = service.buildObjectName("prefix", "My Photo (1).jpeg");
      expect(result).toBe("prefix/My-Photo-1-.jpeg");
    });
  });

  describe("allowedImageExts", () => {
    it("should include common image extensions", () => {
      expect(service.allowedImageExts.has(".jpg")).toBe(true);
      expect(service.allowedImageExts.has(".jpeg")).toBe(true);
      expect(service.allowedImageExts.has(".png")).toBe(true);
      expect(service.allowedImageExts.has(".webp")).toBe(true);
      expect(service.allowedImageExts.has(".gif")).toBe(true);
      expect(service.allowedImageExts.has(".avif")).toBe(true);
      expect(service.allowedImageExts.has(".heic")).toBe(true);
    });

    it("should not include non-image extensions", () => {
      expect(service.allowedImageExts.has(".pdf")).toBe(false);
      expect(service.allowedImageExts.has(".txt")).toBe(false);
    });
  });
});
