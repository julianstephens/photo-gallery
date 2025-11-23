import { PassThrough } from "stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GalleryController } from "./gallery.ts";

const uploadJobServiceMocks = vi.hoisted(() => ({
  createJob: vi.fn(),
  updateJobStatus: vi.fn(),
  updateJobProgress: vi.fn(),
  finalizeJob: vi.fn(),
  getJob: vi.fn(),
}));

vi.mock("../services/uploadJob.ts", () => ({
  UploadJobService: vi.fn().mockImplementation(function MockUploadJobService() {
    return uploadJobServiceMocks;
  }),
}));

const bucketServiceMocks = vi.hoisted(() => ({
  uploadStreamToBucket: vi.fn(),
  uploadBufferToBucket: vi.fn(),
  createBucketFolder: vi.fn(),
  renameBucketFolder: vi.fn(),
  emptyBucketFolder: vi.fn(),
  deleteBucketFolder: vi.fn(),
  getBucketFolderContents: vi.fn(),
  getObject: vi.fn(),
}));

vi.mock("../services/bucket.ts", () => ({
  BucketService: vi.fn().mockImplementation(function MockBucketService() {
    return bucketServiceMocks;
  }),
}));

const uploadServiceMocks = vi.hoisted(() => ({
  isImageMime: vi.fn().mockReturnValue(false),
  allowedImageExts: new Set([".jpg", ".png", ".jpeg"]),
  looksLikeZip: vi.fn().mockReturnValue(true),
  isZipMime: vi.fn().mockReturnValue(true),
  buildObjectName: vi.fn((objectPath: string, filename: string) => `${objectPath}/${filename}`),
  sanitizeKeySegment: vi.fn((segment: string) => segment),
}));

vi.mock("../services/upload.ts", () => ({
  UploadService: vi.fn().mockImplementation(function MockUploadService() {
    return uploadServiceMocks;
  }),
}));

const unzipperBufferMock = vi.hoisted(() => vi.fn());

vi.mock("unzipper", () => ({
  default: {
    Open: {
      buffer: unzipperBufferMock,
    },
  },
}));

describe("GalleryController ZIP watchdog", () => {
  const flushAsync = async () => {
    await Promise.resolve();
  };

  beforeEach(() => {
    vi.useFakeTimers();

    uploadJobServiceMocks.createJob.mockReset().mockResolvedValue("job-123");
    uploadJobServiceMocks.updateJobStatus.mockReset().mockResolvedValue(undefined);
    uploadJobServiceMocks.updateJobProgress.mockReset().mockResolvedValue(undefined);
    uploadJobServiceMocks.finalizeJob.mockReset().mockResolvedValue(undefined);
    uploadJobServiceMocks.getJob.mockReset();

    uploadServiceMocks.isImageMime.mockReset().mockReturnValue(false);
    uploadServiceMocks.allowedImageExts = new Set([".jpg", ".png", ".jpeg"]);
    uploadServiceMocks.looksLikeZip.mockReset().mockReturnValue(true);
    uploadServiceMocks.isZipMime.mockReset().mockReturnValue(true);
    uploadServiceMocks.buildObjectName
      .mockReset()
      .mockImplementation((objectPath: string, filename: string) => `${objectPath}/${filename}`);
    uploadServiceMocks.sanitizeKeySegment
      .mockReset()
      .mockImplementation((segment: string) => segment);

    bucketServiceMocks.uploadStreamToBucket
      .mockReset()
      .mockImplementation((_, __, stream: NodeJS.ReadableStream) => {
        return new Promise<void>((resolve) => {
          stream.once("close", resolve);
        });
      });
    bucketServiceMocks.uploadBufferToBucket.mockReset();
    bucketServiceMocks.createBucketFolder.mockReset();
    bucketServiceMocks.renameBucketFolder.mockReset();
    bucketServiceMocks.emptyBucketFolder.mockReset();
    bucketServiceMocks.deleteBucketFolder.mockReset();
    bucketServiceMocks.getBucketFolderContents.mockReset();
    bucketServiceMocks.getObject.mockReset();

    unzipperBufferMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fails the job when the ZIP watchdog triggers", async () => {
    const stream = new PassThrough();
    stream.on("error", () => {});
    const entry = {
      type: "File",
      path: "image.jpg",
      uncompressedSize: 10,
      stream: vi.fn(() => stream),
    };

    unzipperBufferMock.mockResolvedValue({ files: [entry] });

    const controller = new GalleryController();
    const file = {
      originalname: "archive.zip",
      mimetype: "application/zip",
      size: 100,
      buffer: Buffer.from("zip"),
      fieldname: "file",
      encoding: "7bit",
      destination: "",
      filename: "archive.zip",
      path: "",
      stream,
    } as unknown as Express.Multer.File;

    const uploadResult = await controller.uploadToGallery(file, "gallery", "guild", "uploads");
    expect(uploadResult).toEqual({ type: "async", jobId: "job-123" });

    await flushAsync();
    await flushAsync();
    expect(bucketServiceMocks.uploadStreamToBucket).toHaveBeenCalled();

    await vi.runAllTimersAsync();
    await flushAsync();
    await flushAsync();

    expect(uploadJobServiceMocks.updateJobStatus).toHaveBeenCalledWith(
      "job-123",
      "failed",
      "ZIP processing timed out.",
    );
    expect(uploadJobServiceMocks.finalizeJob).toHaveBeenCalledWith("job-123");
  });
});
