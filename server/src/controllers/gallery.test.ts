import { describe, it, expect } from "vitest";
import { UploadService } from "../services/upload.ts";

describe("GalleryAPI Unit Tests", () => {
  describe("Input validation", () => {
    it("should validate empty strings", () => {
      const validateString = (value: string, errorMessage?: string) => {
        if (!value || value.trim() === "") {
          throw new Error(errorMessage ?? "Input string cannot be empty");
        }
        return value.trim();
      };

      expect(() => validateString("")).toThrow("Input string cannot be empty");
      expect(() => validateString("   ")).toThrow("Input string cannot be empty");
      expect(() => validateString("", "Custom error")).toThrow("Custom error");
      expect(validateString("  test  ")).toBe("test");
    });
  });

  describe("Image file validation", () => {
    it("should identify image MIME types", () => {
      const uploadService = new UploadService();

      expect(uploadService.isImageMime("image/jpeg")).toBe(true);
      expect(uploadService.isImageMime("image/png")).toBe(true);
      expect(uploadService.isImageMime("application/pdf")).toBe(false);
    });

    it("should identify ZIP MIME types", () => {
      const uploadService = new UploadService();

      expect(uploadService.isZipMime("application/zip")).toBe(true);
      expect(uploadService.isZipMime("application/x-zip-compressed")).toBe(true);
      expect(uploadService.isZipMime("image/jpeg")).toBe(false);
    });

    it("should have correct allowed image extensions", () => {
      const uploadService = new UploadService();

      expect(uploadService.allowedImageExts.has(".jpg")).toBe(true);
      expect(uploadService.allowedImageExts.has(".png")).toBe(true);
      expect(uploadService.allowedImageExts.has(".gif")).toBe(true);
      expect(uploadService.allowedImageExts.has(".pdf")).toBe(false);
    });
  });
});
