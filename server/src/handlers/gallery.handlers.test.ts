import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

const controllerMocks = vi.hoisted(() => ({
  listGalleries: vi.fn(),
  getGalleryContents: vi.fn(),
  createGallery: vi.fn(),
  uploadToGallery: vi.fn(),
  setDefaultGallery: vi.fn(),
  removeGallery: vi.fn(),
  getUploadJob: vi.fn(),
  getImage: vi.fn(),
}));

const schemaMocks = vi.hoisted(() => ({
  createGallerySchema: { parse: vi.fn((body) => body) },
  removeGallerySchema: { parse: vi.fn((body) => body) },
  setDefaultGallerySchema: { parse: vi.fn((body) => body) },
}));

vi.mock("../controllers/index.ts", () => ({
  GalleryController: vi.fn().mockImplementation(function MockGalleryController() {
    return controllerMocks;
  }),
}));

vi.mock("../middleware/logger.ts", () => ({
  appLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("utils", () => schemaMocks);

const handlers = await import("./gallery.ts");
const {
  listGalleries,
  listGalleryItems,
  createGallery,
  uploadToGallery,
  setDefaultGallery,
  removeGallery,
  getUploadJob,
  getImage,
} = handlers;

const createRes = () => {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnThis();
  res.json = vi.fn().mockReturnThis();
  res.send = vi.fn().mockReturnThis();
  res.setHeader = vi.fn();
  res.sendStatus = vi.fn().mockReturnThis();
  res.statusCode = 200;
  return res as Response;
};

const createReq = (overrides: Partial<Request> = {}) => {
  const req: Partial<Request> = {
    query: {},
    body: {},
    params: {},
    session: {} as Request["session"],
    ...overrides,
  };
  if (!req.session) req.session = {} as Request["session"];
  if (!req.params) req.params = {} as Request["params"];
  if (!req.query) req.query = {} as Request["query"];
  if (!req.body) req.body = {};
  return req as Request;
};

const resetMocks = () => {
  Object.values(controllerMocks).forEach((mockFn) => mockFn.mockReset());
  schemaMocks.createGallerySchema.parse.mockReset().mockImplementation((body) => body);
  schemaMocks.removeGallerySchema.parse.mockReset().mockImplementation((body) => body);
  schemaMocks.setDefaultGallerySchema.parse.mockReset().mockImplementation((body) => body);
};

describe("gallery handlers", () => {
  beforeEach(() => {
    resetMocks();
  });

  describe("listGalleries", () => {
    it("returns 400 when guildId is missing", async () => {
      const req = createReq();
      const res = createRes();

      await listGalleries(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Missing guildId parameter" });
      expect(controllerMocks.listGalleries).not.toHaveBeenCalled();
    });

    it("returns list of galleries", async () => {
      const req = createReq({ query: { guildId: "123" } as Request["query"] });
      const res = createRes();
      controllerMocks.listGalleries.mockResolvedValue([{ name: "summer" }]);

      await listGalleries(req, res);

      expect(controllerMocks.listGalleries).toHaveBeenCalledWith("123");
      expect(res.json).toHaveBeenCalledWith([{ name: "summer" }]);
    });
  });

  describe("listGalleryItems", () => {
    it("validates galleryName is present", async () => {
      const res = createRes();

      await listGalleryItems(createReq(), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Missing galleryName parameter" });
    });

    it("validates guildId is present", async () => {
      const req = createReq({ query: { galleryName: "g" } as Request["query"] });
      const res = createRes();

      await listGalleryItems(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Missing guildId parameter" });
    });

    it("returns gallery items when params are valid", async () => {
      const req = createReq({
        query: { galleryName: "g", guildId: "guild-1" } as Request["query"],
      });
      const res = createRes();
      controllerMocks.getGalleryContents.mockResolvedValue({ count: 0, contents: [] });

      await listGalleryItems(req, res);

      expect(controllerMocks.getGalleryContents).toHaveBeenCalledWith("guild-1", "g");
      expect(res.json).toHaveBeenCalledWith({ count: 0, contents: [] });
    });
  });

  describe("createGallery", () => {
    const body = { guildId: "1", galleryName: "main", ttlWeeks: 1 };

    it("parses the body and creates a gallery", async () => {
      const req = createReq({ body, session: { userId: "u1" } as Request["session"] });
      const res = createRes();
      controllerMocks.createGallery.mockResolvedValue({ meta: true });

      await createGallery(req, res);

      expect(schemaMocks.createGallerySchema.parse).toHaveBeenCalledWith(body);
      expect(controllerMocks.createGallery).toHaveBeenCalledWith(body, "u1");
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ meta: true });
    });

    it("maps invalid input errors to 400", async () => {
      const req = createReq({ body });
      const res = createRes();
      controllerMocks.createGallery.mockRejectedValue({
        name: "InvalidInputError",
        message: "bad",
      });

      await createGallery(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "bad" });
    });

    it("maps Zod errors to 400", async () => {
      const req = createReq({ body });
      const res = createRes();
      schemaMocks.createGallerySchema.parse.mockImplementation(() => {
        throw new ZodError([]);
      });

      await createGallery(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalled();
    });

    it("maps duplicate errors to 409", async () => {
      const req = createReq({ body });
      const res = createRes();
      controllerMocks.createGallery.mockRejectedValue(new Error("Already exists"));

      await createGallery(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
    });
  });

  describe("uploadToGallery", () => {
    const baseReq = {
      file: { originalname: "a.zip" },
      body: { guildId: "g1", galleryName: "gal" },
    } as Partial<Request>;

    it("requires a file", async () => {
      const res = createRes();
      const req = createReq({ body: baseReq.body });

      await uploadToGallery(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Missing 'file' form field" });
    });

    it("creates upload jobs", async () => {
      const res = createRes();
      const req = createReq({
        file: { originalname: "photo.png" } as Express.Multer.File,
        body: baseReq.body,
      });
      controllerMocks.uploadToGallery.mockResolvedValue({ type: "sync" });

      await uploadToGallery(req, res);

      expect(controllerMocks.uploadToGallery).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ type: "sync" });
    });

    it("maps unsupported mime errors", async () => {
      const res = createRes();
      const req = createReq({
        file: { originalname: "photo.png" } as Express.Multer.File,
        body: baseReq.body,
      });
      controllerMocks.uploadToGallery.mockRejectedValue({
        name: "UnsupportedMimeTypeError",
        message: "Nope",
      });

      await uploadToGallery(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Nope" });
    });

    it("maps missing bucket errors", async () => {
      const res = createRes();
      const req = createReq({
        file: { originalname: "photo.png" } as Express.Multer.File,
        body: baseReq.body,
      });
      controllerMocks.uploadToGallery.mockRejectedValue({ name: "BucketMissingError" });

      await uploadToGallery(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Bucket does not exist" });
    });
  });

  describe("setDefaultGallery", () => {
    it("persists the default gallery", async () => {
      const body = { guildId: "g", galleryName: "name" };
      const req = createReq({ body, session: { userId: "u" } as Request["session"] });
      const res = createRes();
      controllerMocks.setDefaultGallery.mockResolvedValue({ ok: true });

      await setDefaultGallery(req, res);

      expect(schemaMocks.setDefaultGallerySchema.parse).toHaveBeenCalledWith(body);
      expect(controllerMocks.setDefaultGallery).toHaveBeenCalledWith(body, "u");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });

    it("handles invalid input", async () => {
      const req = createReq({ body: { guildId: "g" } });
      const res = createRes();
      controllerMocks.setDefaultGallery.mockRejectedValue({
        name: "InvalidInputError",
        message: "no",
      });

      await setDefaultGallery(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "no" });
    });
  });

  describe("removeGallery", () => {
    it("removes galleries and returns 204", async () => {
      const body = { guildId: "g", galleryName: "n" };
      const req = createReq({ body });
      const res = createRes();

      await removeGallery(req, res);

      expect(schemaMocks.removeGallerySchema.parse).toHaveBeenCalledWith(body);
      expect(controllerMocks.removeGallery).toHaveBeenCalledWith("g", "n");
      expect(res.status).toHaveBeenCalledWith(204);
    });

    it("handles zod validation errors", async () => {
      const req = createReq({ body: {} });
      const res = createRes();
      schemaMocks.removeGallerySchema.parse.mockImplementation(() => {
        throw new ZodError([]);
      });

      await removeGallery(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe("getUploadJob", () => {
    it("requires jobId", async () => {
      const res = createRes();

      await getUploadJob(createReq(), res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("maps not found errors", async () => {
      const res = createRes();
      const req = createReq({ params: { jobId: "123" } as Request["params"] });
      controllerMocks.getUploadJob.mockRejectedValue({ name: "InvalidInputError", message: "no" });

      await getUploadJob(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "no" });
    });
  });

  describe("getImage", () => {
    it("validates required params", async () => {
      const res = createRes();

      await getImage(createReq(), res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("requires guildId", async () => {
      const res = createRes();
      const req = createReq({
        params: { galleryName: "g", imagePath: "img.png" } as Request["params"],
      });

      await getImage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Missing guildId parameter" });
    });

    it("fetches images and sets headers", async () => {
      const res = createRes();
      const req = createReq({
        params: { galleryName: "g", imagePath: "img.png" } as Request["params"],
        query: { guildId: "guild-1" } as Request["query"],
      });
      controllerMocks.getImage.mockResolvedValue({
        data: Buffer.from("123"),
        contentType: "image/png",
      });

      await getImage(req, res);

      expect(controllerMocks.getImage).toHaveBeenCalledWith("guild-1", "g", "img.png");
      expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "image/png");
      expect(res.send).toHaveBeenCalledWith(Buffer.from("123"));
    });

    it("maps missing objects", async () => {
      const res = createRes();
      const req = createReq({
        params: { galleryName: "g", imagePath: "img.png" } as Request["params"],
        query: { guildId: "guild-1" } as Request["query"],
      });
      controllerMocks.getImage.mockRejectedValue({ name: "NoSuchKey" });

      await getImage(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Image not found" });
    });
  });
});
