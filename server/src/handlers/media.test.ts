import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const bucketServiceMocks = vi.hoisted(() => ({
  createPresignedUrl: vi.fn(),
  getObject: vi.fn(),
}));

vi.mock("../services/bucket.ts", () => ({
  BucketService: {
    create: vi.fn().mockResolvedValue(bucketServiceMocks),
  },
}));

const handlers = await import("./media.ts");
const { streamMedia } = handlers;

const createRes = () => {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnThis();
  res.json = vi.fn().mockReturnThis();
  res.send = vi.fn().mockReturnThis();
  res.setHeader = vi.fn();
  return res as Response;
};

const createReq = (overrides: Partial<Request> = {}) => {
  const req: Partial<Request> = {
    query: {},
    body: {},
    params: {},
    headers: {},
    ...overrides,
  };
  return req as Request;
};

const resetMocks = () => {
  bucketServiceMocks.createPresignedUrl.mockReset();
  bucketServiceMocks.getObject.mockReset();
};

describe("media handlers", () => {
  beforeEach(() => {
    resetMocks();
  });

  describe("streamMedia", () => {
    describe("HTML rendering path", () => {
      it("returns HTML page when Accept header includes text/html", async () => {
        const req = createReq({
          params: { galleryName: "summer", objectName: "photo.jpg" } as Request["params"],
          headers: { accept: "text/html" },
        });
        const res = createRes();
        bucketServiceMocks.createPresignedUrl.mockResolvedValue(
          "https://example.com/presigned-url",
        );

        await streamMedia(req, res);

        expect(bucketServiceMocks.createPresignedUrl).toHaveBeenCalledWith("summer/photo.jpg");
        expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/html");
        expect(res.send).toHaveBeenCalled();
        const htmlContent = (res.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
        expect(htmlContent).toContain("<!DOCTYPE html>");
        expect(htmlContent).toContain("https://example.com/presigned-url");
      });

      it("handles nested object paths", async () => {
        const req = createReq({
          params: {
            galleryName: "vacation",
            objectName: ["2024", "summer", "beach.png"],
          } as Request["params"],
          headers: { accept: "text/html,application/xhtml+xml" },
        });
        const res = createRes();
        bucketServiceMocks.createPresignedUrl.mockResolvedValue("https://example.com/nested-url");

        await streamMedia(req, res);

        expect(bucketServiceMocks.createPresignedUrl).toHaveBeenCalledWith(
          "vacation/2024/summer/beach.png",
        );
        expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/html");
      });

      it("escapes HTML entities in fileName to prevent XSS", async () => {
        // Realistically, angle brackets would be URL-encoded in the path,
        // but the handler should still escape any dangerous characters
        const req = createReq({
          params: {
            galleryName: "gallery",
            objectName: 'file"onclick=alert(1)".jpg',
          } as Request["params"],
          headers: { accept: "text/html" },
        });
        const res = createRes();
        bucketServiceMocks.createPresignedUrl.mockResolvedValue("https://example.com/url");

        await streamMedia(req, res);

        const htmlContent = (res.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
        // Quotes should be escaped to prevent attribute injection
        expect(htmlContent).not.toContain('"onclick=');
        expect(htmlContent).toContain("&quot;onclick=");
      });

      it("escapes HTML entities in presignedUrl to prevent XSS", async () => {
        const req = createReq({
          params: { galleryName: "gallery", objectName: "photo.jpg" } as Request["params"],
          headers: { accept: "text/html" },
        });
        const res = createRes();
        // Simulate a malicious URL (though unlikely from S3, should still be safe)
        bucketServiceMocks.createPresignedUrl.mockResolvedValue(
          'https://example.com?foo="><script>alert("xss")</script>',
        );

        await streamMedia(req, res);

        const htmlContent = (res.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
        expect(htmlContent).not.toContain('"><script>');
        expect(htmlContent).toContain("&quot;&gt;&lt;script&gt;");
      });
    });

    describe("direct image serving path", () => {
      it("returns image data when Accept header does not include text/html", async () => {
        const req = createReq({
          params: { galleryName: "photos", objectName: "image.png" } as Request["params"],
          headers: { accept: "image/*" },
        });
        const res = createRes();
        const imageBuffer = Buffer.from("fake-image-data");
        bucketServiceMocks.getObject.mockResolvedValue({
          data: imageBuffer,
          contentType: "image/png",
        });

        await streamMedia(req, res);

        expect(bucketServiceMocks.getObject).toHaveBeenCalledWith("photos/image.png");
        expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "image/png");
        expect(res.send).toHaveBeenCalledWith(imageBuffer);
      });

      it("returns image data when Accept header is empty", async () => {
        const req = createReq({
          params: { galleryName: "photos", objectName: "image.jpg" } as Request["params"],
          headers: {},
        });
        const res = createRes();
        const imageBuffer = Buffer.from("jpeg-data");
        bucketServiceMocks.getObject.mockResolvedValue({
          data: imageBuffer,
          contentType: "image/jpeg",
        });

        await streamMedia(req, res);

        expect(bucketServiceMocks.getObject).toHaveBeenCalledWith("photos/image.jpg");
        expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "image/jpeg");
        expect(res.send).toHaveBeenCalledWith(imageBuffer);
      });

      it("handles nested object paths for direct serving", async () => {
        const req = createReq({
          params: {
            galleryName: "archive",
            objectName: ["year", "month", "day", "file.webp"],
          } as Request["params"],
          headers: { accept: "image/webp" },
        });
        const res = createRes();
        const imageBuffer = Buffer.from("webp-data");
        bucketServiceMocks.getObject.mockResolvedValue({
          data: imageBuffer,
          contentType: "image/webp",
        });

        await streamMedia(req, res);

        expect(bucketServiceMocks.getObject).toHaveBeenCalledWith(
          "archive/year/month/day/file.webp",
        );
        expect(res.send).toHaveBeenCalledWith(imageBuffer);
      });
    });

    describe("error handling", () => {
      it("returns 500 when presigned URL creation fails", async () => {
        const req = createReq({
          params: { galleryName: "gallery", objectName: "photo.jpg" } as Request["params"],
          headers: { accept: "text/html" },
        });
        const res = createRes();
        bucketServiceMocks.createPresignedUrl.mockRejectedValue(new Error("S3 error"));

        await streamMedia(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.send).toHaveBeenCalledWith("Error streaming media");
      });

      it("returns 500 when object retrieval fails", async () => {
        const req = createReq({
          params: { galleryName: "gallery", objectName: "photo.jpg" } as Request["params"],
          headers: { accept: "image/*" },
        });
        const res = createRes();
        bucketServiceMocks.getObject.mockRejectedValue(new Error("Object not found"));

        await streamMedia(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.send).toHaveBeenCalledWith("Error streaming media");
      });

      it("logs errors to console", async () => {
        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const req = createReq({
          params: { galleryName: "gallery", objectName: "photo.jpg" } as Request["params"],
          headers: { accept: "image/*" },
        });
        const res = createRes();
        const error = new Error("Test error");
        bucketServiceMocks.getObject.mockRejectedValue(error);

        await streamMedia(req, res);

        expect(consoleSpy).toHaveBeenCalledWith("Error streaming media:", error);
        consoleSpy.mockRestore();
      });
    });
  });
});
