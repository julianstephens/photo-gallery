import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { mockEnvModule, mockRedisModule } from "../utils/test-mocks.ts";

const requestServiceMocks = vi.hoisted(() => ({
  createRequest: vi.fn(),
  getRequest: vi.fn(),
  getRequestsByUser: vi.fn(),
  updateRequestStatus: vi.fn(),
  addComment: vi.fn(),
}));

const authorizationMocks = vi.hoisted(() => ({
  canCreateRequest: vi.fn(),
  canViewRequest: vi.fn(),
  canCancelRequest: vi.fn(),
  canCommentOnRequest: vi.fn(),
  AuthorizationError: class AuthorizationError extends Error {
    public readonly code = "AUTHORIZATION_ERROR";
    public readonly status = 403;
    constructor(
      message: string,
      public readonly action: string,
      public readonly resourceId?: string,
    ) {
      super(message);
      this.name = "AuthorizationError";
    }
  },
}));

const schemaMocks = vi.hoisted(() => ({
  createRequestSchema: { parse: vi.fn((body) => body) },
  addCommentSchema: { parse: vi.fn((body) => body) },
}));

vi.mock("../schemas/env.ts", () => mockEnvModule());
vi.mock("../redis.ts", () => mockRedisModule());

vi.mock("../services/request.ts", () => ({
  RequestService: function MockRequestService() {
    return requestServiceMocks;
  },
  canCreateRequest: authorizationMocks.canCreateRequest,
  canViewRequest: authorizationMocks.canViewRequest,
  canCancelRequest: authorizationMocks.canCancelRequest,
  canCommentOnRequest: authorizationMocks.canCommentOnRequest,
  AuthorizationError: authorizationMocks.AuthorizationError,
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

const handlers = await import("./request.ts");
const { createRequest, listMyRequests, cancelRequest, addComment } = handlers;

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
    session: {
      userId: "user123",
      isAdmin: true,
      isSuperAdmin: false,
      guildIds: ["guild123"],
    } as Request["session"],
    ...overrides,
  };
  if (!req.session) req.session = {} as Request["session"];
  if (!req.params) req.params = {} as Request["params"];
  if (!req.query) req.query = {} as Request["query"];
  if (!req.body) req.body = {};
  return req as Request;
};

const resetMocks = () => {
  Object.values(requestServiceMocks).forEach((mockFn) => mockFn.mockReset());
  // Only reset the mock functions, not the AuthorizationError class
  authorizationMocks.canCreateRequest.mockReset();
  authorizationMocks.canViewRequest.mockReset();
  authorizationMocks.canCancelRequest.mockReset();
  authorizationMocks.canCommentOnRequest.mockReset();
  schemaMocks.createRequestSchema.parse.mockReset().mockImplementation((body) => body);
  schemaMocks.addCommentSchema.parse.mockReset().mockImplementation((body) => body);
};

describe("request handlers", () => {
  beforeEach(() => {
    resetMocks();
  });

  describe("createRequest", () => {
    it("returns 400 when guildId is missing", async () => {
      const req = createReq({ params: {} });
      const res = createRes();

      await createRequest(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Missing guildId parameter" });
      expect(requestServiceMocks.createRequest).not.toHaveBeenCalled();
    });

    it("returns 403 when user cannot create request in guild", async () => {
      const req = createReq({
        params: { guildId: "guild123" },
        body: { title: "Test", description: "Test description" },
      });
      const res = createRes();
      authorizationMocks.canCreateRequest.mockReturnValue(false);

      await createRequest(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "You do not have permission to create requests in this guild",
        code: "AUTHORIZATION_ERROR",
      });
    });

    it("creates request successfully", async () => {
      const mockRequest = {
        id: "req123",
        guildId: "guild123",
        userId: "user123",
        title: "Test",
        description: "Test description",
        status: "open",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const req = createReq({
        params: { guildId: "guild123" },
        body: { title: "Test", description: "Test description" },
        session: {
          userId: "user123",
          isAdmin: true,
          isSuperAdmin: false,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      authorizationMocks.canCreateRequest.mockReturnValue(true);
      requestServiceMocks.createRequest.mockResolvedValue(mockRequest);

      await createRequest(req, res);

      expect(authorizationMocks.canCreateRequest).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "user123", isAdmin: true }),
        "guild123",
      );
      expect(requestServiceMocks.createRequest).toHaveBeenCalledWith(
        "guild123",
        "user123",
        "Test",
        "Test description",
        undefined,
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockRequest);
    });

    it("creates request with optional galleryId", async () => {
      const mockRequest = {
        id: "req123",
        guildId: "guild123",
        userId: "user123",
        title: "Test",
        description: "Test description",
        galleryId: "gallery456",
        status: "open",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const req = createReq({
        params: { guildId: "guild123" },
        body: { title: "Test", description: "Test description", galleryId: "gallery456" },
        session: {
          userId: "user123",
          isAdmin: true,
          isSuperAdmin: false,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      authorizationMocks.canCreateRequest.mockReturnValue(true);
      requestServiceMocks.createRequest.mockResolvedValue(mockRequest);

      await createRequest(req, res);

      expect(requestServiceMocks.createRequest).toHaveBeenCalledWith(
        "guild123",
        "user123",
        "Test",
        "Test description",
        "gallery456",
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockRequest);
    });

    it("returns 400 for zod validation errors", async () => {
      const req = createReq({
        params: { guildId: "guild123" },
        body: {},
      });
      const res = createRes();

      schemaMocks.createRequestSchema.parse.mockImplementation(() => {
        throw new ZodError([
          {
            code: "invalid_type",
            expected: "string",
            received: "undefined",
            path: ["title"],
            message: "Required",
          },
        ]);
      });

      await createRequest(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Required" });
    });

    it("returns 500 for service errors", async () => {
      const req = createReq({
        params: { guildId: "guild123" },
        body: { title: "Test", description: "Test description" },
      });
      const res = createRes();

      authorizationMocks.canCreateRequest.mockReturnValue(true);
      requestServiceMocks.createRequest.mockRejectedValue(new Error("Redis connection failed"));

      await createRequest(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to create request" });
    });
  });

  describe("listMyRequests", () => {
    it("returns 400 when guildId is missing", async () => {
      const req = createReq({ params: {} });
      const res = createRes();

      await listMyRequests(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Missing guildId parameter" });
    });

    it("returns 400 when requestor is not me", async () => {
      const req = createReq({
        params: { guildId: "guild123" },
        query: { requestor: "other" },
      });
      const res = createRes();

      await listMyRequests(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Only requestor=me is supported for admin users",
      });
    });

    it("returns 403 when user is not a member of the guild", async () => {
      const req = createReq({
        params: { guildId: "other-guild" },
        query: { requestor: "me" },
        session: {
          userId: "user123",
          isAdmin: true,
          isSuperAdmin: false,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      await listMyRequests(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "You are not a member of this guild",
        code: "AUTHORIZATION_ERROR",
      });
    });

    it("returns filtered requests for the user in the guild", async () => {
      const mockRequests = [
        {
          id: "req1",
          guildId: "guild123",
          userId: "user123",
          title: "Request 1",
          description: "Desc 1",
          status: "open",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: "req2",
          guildId: "guild123",
          userId: "user123",
          title: "Request 2",
          description: "Desc 2",
          status: "approved",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      const req = createReq({
        params: { guildId: "guild123" },
        query: { requestor: "me" },
        session: {
          userId: "user123",
          isAdmin: true,
          isSuperAdmin: false,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      requestServiceMocks.getRequestsByUser.mockResolvedValue(mockRequests);
      authorizationMocks.canViewRequest.mockReturnValue(true);

      await listMyRequests(req, res);

      expect(requestServiceMocks.getRequestsByUser).toHaveBeenCalledWith("user123");
      expect(res.json).toHaveBeenCalledWith(mockRequests);
    });

    it("filters out requests from other guilds", async () => {
      const mockRequests = [
        {
          id: "req1",
          guildId: "guild123",
          userId: "user123",
          title: "Request 1",
          description: "Desc 1",
          status: "open",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: "req2",
          guildId: "other-guild",
          userId: "user123",
          title: "Request 2",
          description: "Desc 2",
          status: "approved",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      const req = createReq({
        params: { guildId: "guild123" },
        query: { requestor: "me" },
        session: {
          userId: "user123",
          isAdmin: true,
          isSuperAdmin: false,
          guildIds: ["guild123", "other-guild"],
        } as Request["session"],
      });
      const res = createRes();

      requestServiceMocks.getRequestsByUser.mockResolvedValue(mockRequests);
      authorizationMocks.canViewRequest.mockImplementation(
        (ctx, request) => request.guildId === "guild123",
      );

      await listMyRequests(req, res);

      expect(res.json).toHaveBeenCalledWith([mockRequests[0]]);
    });

    it("returns empty array when no requests exist", async () => {
      const req = createReq({
        params: { guildId: "guild123" },
        query: { requestor: "me" },
        session: {
          userId: "user123",
          isAdmin: true,
          isSuperAdmin: false,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      requestServiceMocks.getRequestsByUser.mockResolvedValue([]);

      await listMyRequests(req, res);

      expect(res.json).toHaveBeenCalledWith([]);
    });

    it("returns 500 for service errors", async () => {
      const req = createReq({
        params: { guildId: "guild123" },
        query: { requestor: "me" },
        session: {
          userId: "user123",
          isAdmin: true,
          isSuperAdmin: false,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      requestServiceMocks.getRequestsByUser.mockRejectedValue(new Error("Redis connection failed"));

      await listMyRequests(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to list requests" });
    });
  });

  describe("cancelRequest", () => {
    const baseRequest = {
      id: "req123",
      guildId: "guild123",
      userId: "user123",
      title: "Test",
      description: "Desc",
      status: "open" as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    it("returns 400 when requestId is missing", async () => {
      const req = createReq({ params: {} });
      const res = createRes();

      await cancelRequest(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Missing requestId parameter" });
    });

    it("returns 404 when request does not exist", async () => {
      const req = createReq({
        params: { requestId: "non-existent" },
      });
      const res = createRes();

      requestServiceMocks.getRequest.mockResolvedValue(null);

      await cancelRequest(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Request not found" });
    });

    it("returns 403 when user cannot cancel the request", async () => {
      const req = createReq({
        params: { requestId: "req123" },
        session: {
          userId: "other-user",
          isAdmin: true,
          isSuperAdmin: false,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      requestServiceMocks.getRequest.mockResolvedValue(baseRequest);
      authorizationMocks.canCancelRequest.mockReturnValue(false);

      await cancelRequest(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "You do not have permission to cancel this request",
        code: "AUTHORIZATION_ERROR",
      });
    });

    it("cancels request successfully", async () => {
      const cancelledRequest = { ...baseRequest, status: "cancelled" as const };

      const req = createReq({
        params: { requestId: "req123" },
        session: {
          userId: "user123",
          isAdmin: true,
          isSuperAdmin: false,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      requestServiceMocks.getRequest.mockResolvedValue(baseRequest);
      authorizationMocks.canCancelRequest.mockReturnValue(true);
      requestServiceMocks.updateRequestStatus.mockResolvedValue(cancelledRequest);

      await cancelRequest(req, res);

      expect(requestServiceMocks.updateRequestStatus).toHaveBeenCalledWith("req123", "cancelled");
      expect(res.json).toHaveBeenCalledWith(cancelledRequest);
    });

    it("returns 400 for invalid status transition", async () => {
      const approvedRequest = { ...baseRequest, status: "approved" as const };

      const req = createReq({
        params: { requestId: "req123" },
      });
      const res = createRes();

      requestServiceMocks.getRequest.mockResolvedValue(approvedRequest);
      authorizationMocks.canCancelRequest.mockReturnValue(true);
      requestServiceMocks.updateRequestStatus.mockRejectedValue(
        new Error("Invalid status transition from approved to cancelled"),
      );

      await cancelRequest(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Invalid status transition from approved to cancelled",
      });
    });

    it("returns 500 for service errors", async () => {
      const req = createReq({
        params: { requestId: "req123" },
      });
      const res = createRes();

      requestServiceMocks.getRequest.mockResolvedValue(baseRequest);
      authorizationMocks.canCancelRequest.mockReturnValue(true);
      requestServiceMocks.updateRequestStatus.mockRejectedValue(
        new Error("Redis connection failed"),
      );

      await cancelRequest(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to cancel request" });
    });

    it("does not allow cancelling non-open request (canCancelRequest returns false)", async () => {
      const closedRequest = { ...baseRequest, status: "closed" as const };

      const req = createReq({
        params: { requestId: "req123" },
        session: {
          userId: "user123",
          isAdmin: true,
          isSuperAdmin: false,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      requestServiceMocks.getRequest.mockResolvedValue(closedRequest);
      authorizationMocks.canCancelRequest.mockReturnValue(false);

      await cancelRequest(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "You do not have permission to cancel this request",
        code: "AUTHORIZATION_ERROR",
      });
    });
  });

  describe("addComment", () => {
    const baseRequest = {
      id: "req123",
      guildId: "guild123",
      userId: "user123",
      title: "Test",
      description: "Desc",
      status: "open" as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    it("returns 400 when requestId is missing", async () => {
      const req = createReq({ params: {} });
      const res = createRes();

      await addComment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Missing requestId parameter" });
    });

    it("returns 404 when request does not exist", async () => {
      const req = createReq({
        params: { requestId: "non-existent" },
        body: { content: "Test comment" },
      });
      const res = createRes();

      requestServiceMocks.getRequest.mockResolvedValue(null);

      await addComment(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Request not found" });
    });

    it("returns 403 when user cannot comment on the request", async () => {
      const req = createReq({
        params: { requestId: "req123" },
        body: { content: "Test comment" },
        session: {
          userId: "other-user",
          isAdmin: true,
          isSuperAdmin: false,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      requestServiceMocks.getRequest.mockResolvedValue(baseRequest);
      authorizationMocks.canCommentOnRequest.mockReturnValue(false);

      await addComment(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "You do not have permission to comment on this request",
        code: "AUTHORIZATION_ERROR",
      });
    });

    it("adds comment successfully", async () => {
      const mockComment = {
        id: "comment123",
        requestId: "req123",
        userId: "user123",
        content: "Test comment",
        createdAt: Date.now(),
      };

      const req = createReq({
        params: { requestId: "req123" },
        body: { content: "Test comment" },
        session: {
          userId: "user123",
          isAdmin: true,
          isSuperAdmin: false,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      requestServiceMocks.getRequest.mockResolvedValue(baseRequest);
      authorizationMocks.canCommentOnRequest.mockReturnValue(true);
      requestServiceMocks.addComment.mockResolvedValue(mockComment);

      await addComment(req, res);

      expect(requestServiceMocks.addComment).toHaveBeenCalledWith(
        "req123",
        "user123",
        "Test comment",
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockComment);
    });

    it("returns 400 for zod validation errors", async () => {
      const req = createReq({
        params: { requestId: "req123" },
        body: {},
      });
      const res = createRes();

      schemaMocks.addCommentSchema.parse.mockImplementation(() => {
        throw new ZodError([
          {
            code: "invalid_type",
            expected: "string",
            received: "undefined",
            path: ["content"],
            message: "Required",
          },
        ]);
      });

      await addComment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Required" });
    });

    it("returns 500 for service errors", async () => {
      const req = createReq({
        params: { requestId: "req123" },
        body: { content: "Test comment" },
      });
      const res = createRes();

      requestServiceMocks.getRequest.mockResolvedValue(baseRequest);
      authorizationMocks.canCommentOnRequest.mockReturnValue(true);
      requestServiceMocks.addComment.mockRejectedValue(new Error("Redis connection failed"));

      await addComment(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to add comment" });
    });

    it("does not allow commenting on non-open request (canCommentOnRequest returns false)", async () => {
      const closedRequest = { ...baseRequest, status: "closed" as const };

      const req = createReq({
        params: { requestId: "req123" },
        body: { content: "Test comment" },
        session: {
          userId: "user123",
          isAdmin: true,
          isSuperAdmin: false,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      requestServiceMocks.getRequest.mockResolvedValue(closedRequest);
      authorizationMocks.canCommentOnRequest.mockReturnValue(false);

      await addComment(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "You do not have permission to comment on this request",
        code: "AUTHORIZATION_ERROR",
      });
    });

    it("returns 404 when service throws does not exist error", async () => {
      const req = createReq({
        params: { requestId: "req123" },
        body: { content: "Test comment" },
      });
      const res = createRes();

      requestServiceMocks.getRequest.mockResolvedValue(baseRequest);
      authorizationMocks.canCommentOnRequest.mockReturnValue(true);
      requestServiceMocks.addComment.mockRejectedValue(new Error("Request req123 does not exist"));

      await addComment(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Request req123 does not exist" });
    });
  });
});
