import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { mockEnvModule, mockRedisModule } from "../utils/test-mocks.ts";

const requestServiceMocks = vi.hoisted(() => ({
  createRequest: vi.fn(),
  getRequest: vi.fn(),
  getRequestsByUser: vi.fn(),
  getRequestsByUserAndGuild: vi.fn(),
  getRequestsByGuild: vi.fn(),
  getComments: vi.fn(),
  updateRequestStatus: vi.fn(),
  addComment: vi.fn(),
  deleteRequest: vi.fn(),
  listRequestsFiltered: vi.fn(),
}));

const authorizationMocks = vi.hoisted(() => ({
  canCreateRequest: vi.fn(),
  canCancelRequest: vi.fn(),
  canCommentOnRequest: vi.fn(),
  canViewRequest: vi.fn(),
  canChangeRequestStatus: vi.fn(),
  canDeleteRequest: vi.fn(),
  canListRequests: vi.fn(),
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
  updateRequestStatusSchema: { parse: vi.fn((body) => body) },
  listRequestsFilterSchema: {
    parse: vi.fn((input) => ({
      status: input.status,
      cursor: input.cursor,
      limit: input.limit ?? 20,
      sortDirection: input.sortDirection ?? "desc",
    })),
  },
}));

vi.mock("../schemas/env.ts", () => mockEnvModule());
vi.mock("../redis.ts", () => mockRedisModule());

vi.mock("../services/request.ts", () => ({
  RequestService: function MockRequestService() {
    return requestServiceMocks;
  },
  canCreateRequest: authorizationMocks.canCreateRequest,
  canCancelRequest: authorizationMocks.canCancelRequest,
  canCommentOnRequest: authorizationMocks.canCommentOnRequest,
  canViewRequest: authorizationMocks.canViewRequest,
  canChangeRequestStatus: authorizationMocks.canChangeRequestStatus,
  canDeleteRequest: authorizationMocks.canDeleteRequest,
  canListRequests: authorizationMocks.canListRequests,
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
const {
  createRequest,
  listMyRequests,
  cancelRequest,
  addComment,
  getComments,
  listGuildRequests,
  getRequestById,
  changeRequestStatus,
  deleteRequest,
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
  authorizationMocks.canCancelRequest.mockReset();
  authorizationMocks.canCommentOnRequest.mockReset();
  authorizationMocks.canViewRequest.mockReset();
  authorizationMocks.canChangeRequestStatus.mockReset();
  authorizationMocks.canDeleteRequest.mockReset();
  authorizationMocks.canListRequests.mockReset();
  schemaMocks.createRequestSchema.parse.mockReset().mockImplementation((body) => body);
  schemaMocks.addCommentSchema.parse.mockReset().mockImplementation((body) => body);
  schemaMocks.updateRequestStatusSchema.parse.mockReset().mockImplementation((body) => body);
  schemaMocks.listRequestsFilterSchema.parse.mockReset().mockImplementation((input) => ({
    status: input.status,
    cursor: input.cursor,
    limit: input.limit ?? 20,
    sortDirection: input.sortDirection ?? "desc",
  }));
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
    const mockPaginatedResponse = {
      data: [
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
      ],
      pagination: {
        total: 2,
        count: 2,
        nextCursor: null,
        hasMore: false,
      },
    };

    it("returns 400 when guildId is missing", async () => {
      const req = createReq({ params: {} });
      const res = createRes();

      await listMyRequests(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Missing guildId parameter" });
    });

    it("returns 403 when user cannot list requests", async () => {
      const req = createReq({
        params: { guildId: "guild123" },
        session: {
          userId: "user123",
          isAdmin: false,
          isSuperAdmin: false,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();
      authorizationMocks.canListRequests.mockReturnValue(false);

      await listMyRequests(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "You do not have permission to list requests",
        code: "AUTHORIZATION_ERROR",
      });
    });

    it("returns 403 when user is not a member of the guild", async () => {
      const req = createReq({
        params: { guildId: "other-guild" },
        session: {
          userId: "user123",
          isAdmin: true,
          isSuperAdmin: false,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();
      authorizationMocks.canListRequests.mockReturnValue(true);

      await listMyRequests(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "You are not a member of this guild",
        code: "AUTHORIZATION_ERROR",
      });
    });

    it("returns paginated requests for admin user (own requests only)", async () => {
      const req = createReq({
        params: { guildId: "guild123" },
        query: {},
        session: {
          userId: "user123",
          isAdmin: true,
          isSuperAdmin: false,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      authorizationMocks.canListRequests.mockReturnValue(true);
      requestServiceMocks.listRequestsFiltered.mockResolvedValue(mockPaginatedResponse);

      await listMyRequests(req, res);

      expect(requestServiceMocks.listRequestsFiltered).toHaveBeenCalledWith(
        ["guild123"],
        "user123", // Admin sees own requests only
        expect.objectContaining({ limit: 20, sortDirection: "desc" }),
      );
      expect(res.json).toHaveBeenCalledWith(mockPaginatedResponse);
    });

    it("returns all requests for super admin user", async () => {
      const req = createReq({
        params: { guildId: "guild123" },
        query: {},
        session: {
          userId: "superadmin",
          isAdmin: true,
          isSuperAdmin: true,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      authorizationMocks.canListRequests.mockReturnValue(true);
      requestServiceMocks.listRequestsFiltered.mockResolvedValue(mockPaginatedResponse);

      await listMyRequests(req, res);

      expect(requestServiceMocks.listRequestsFiltered).toHaveBeenCalledWith(
        ["guild123"],
        undefined, // Super admin sees all requests
        expect.objectContaining({ limit: 20, sortDirection: "desc" }),
      );
      expect(res.json).toHaveBeenCalledWith(mockPaginatedResponse);
    });

    it("passes filter parameters correctly", async () => {
      const req = createReq({
        params: { guildId: "guild123" },
        query: { status: "open", cursor: "abc-123", limit: "50", sortDirection: "asc" },
        session: {
          userId: "user123",
          isAdmin: true,
          isSuperAdmin: false,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      authorizationMocks.canListRequests.mockReturnValue(true);
      requestServiceMocks.listRequestsFiltered.mockResolvedValue({
        data: [],
        pagination: { total: 0, count: 0, nextCursor: null, hasMore: false },
      });

      await listMyRequests(req, res);

      expect(schemaMocks.listRequestsFilterSchema.parse).toHaveBeenCalledWith({
        status: "open",
        cursor: "abc-123",
        limit: "50",
        sortDirection: "asc",
      });
    });

    it("returns empty paginated result when no requests exist", async () => {
      const emptyResponse = {
        data: [],
        pagination: { total: 0, count: 0, nextCursor: null, hasMore: false },
      };

      const req = createReq({
        params: { guildId: "guild123" },
        query: {},
        session: {
          userId: "user123",
          isAdmin: true,
          isSuperAdmin: false,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      authorizationMocks.canListRequests.mockReturnValue(true);
      requestServiceMocks.listRequestsFiltered.mockResolvedValue(emptyResponse);

      await listMyRequests(req, res);

      expect(res.json).toHaveBeenCalledWith(emptyResponse);
    });

    it("returns 400 for invalid filter parameters", async () => {
      const req = createReq({
        params: { guildId: "guild123" },
        query: { status: "invalid" },
        session: {
          userId: "user123",
          isAdmin: true,
          isSuperAdmin: false,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      authorizationMocks.canListRequests.mockReturnValue(true);
      schemaMocks.listRequestsFilterSchema.parse.mockImplementation(() => {
        throw new ZodError([
          {
            code: "invalid_enum_value",
            received: "invalid",
            path: ["status"],
            message: "Invalid enum value",
            options: ["open", "approved", "denied", "cancelled", "closed"],
          },
        ]);
      });

      await listMyRequests(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Invalid enum value" });
    });

    it("returns 500 for service errors", async () => {
      const req = createReq({
        params: { guildId: "guild123" },
        query: {},
        session: {
          userId: "user123",
          isAdmin: true,
          isSuperAdmin: false,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      authorizationMocks.canListRequests.mockReturnValue(true);
      requestServiceMocks.listRequestsFiltered.mockRejectedValue(
        new Error("Redis connection failed"),
      );

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

  describe("getComments", () => {
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

    const mockComments = [
      {
        id: "comment1",
        requestId: "req123",
        userId: "user123",
        content: "First comment",
        createdAt: Date.now() - 1000,
      },
      {
        id: "comment2",
        requestId: "req123",
        userId: "superadmin1",
        content: "Second comment",
        createdAt: Date.now(),
      },
    ];

    it("returns 400 when requestId is missing", async () => {
      const req = createReq({ params: {} });
      const res = createRes();

      await getComments(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Missing requestId parameter" });
    });

    it("returns 404 when request does not exist", async () => {
      const req = createReq({
        params: { requestId: "non-existent" },
      });
      const res = createRes();

      requestServiceMocks.getRequest.mockResolvedValue(null);

      await getComments(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Request not found" });
    });

    it("returns 403 when user cannot view the request", async () => {
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
      authorizationMocks.canViewRequest.mockReturnValue(false);

      await getComments(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "You do not have permission to view comments on this request",
        code: "AUTHORIZATION_ERROR",
      });
    });

    it("returns comments for owner admin", async () => {
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
      authorizationMocks.canViewRequest.mockReturnValue(true);
      requestServiceMocks.getComments.mockResolvedValue(mockComments);

      await getComments(req, res);

      expect(requestServiceMocks.getRequest).toHaveBeenCalledWith("req123");
      expect(requestServiceMocks.getComments).toHaveBeenCalledWith("req123");
      expect(res.json).toHaveBeenCalledWith(mockComments);
    });

    it("returns comments for super admin", async () => {
      const req = createReq({
        params: { requestId: "req123" },
        session: {
          userId: "superadmin1",
          isAdmin: true,
          isSuperAdmin: true,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      requestServiceMocks.getRequest.mockResolvedValue(baseRequest);
      authorizationMocks.canViewRequest.mockReturnValue(true);
      requestServiceMocks.getComments.mockResolvedValue(mockComments);

      await getComments(req, res);

      expect(requestServiceMocks.getComments).toHaveBeenCalledWith("req123");
      expect(res.json).toHaveBeenCalledWith(mockComments);
    });

    it("returns empty array when no comments exist", async () => {
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
      authorizationMocks.canViewRequest.mockReturnValue(true);
      requestServiceMocks.getComments.mockResolvedValue([]);

      await getComments(req, res);

      expect(res.json).toHaveBeenCalledWith([]);
    });

    it("returns 500 for service errors", async () => {
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
      authorizationMocks.canViewRequest.mockReturnValue(true);
      requestServiceMocks.getComments.mockRejectedValue(new Error("Redis connection failed"));

      await getComments(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to get comments" });
    });
  });

  describe("listGuildRequests (super admin)", () => {
    const mockPaginatedResponse = {
      data: [
        {
          id: "req1",
          guildId: "guild123",
          userId: "user1",
          title: "Request 1",
          description: "Desc 1",
          status: "open" as const,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: "req2",
          guildId: "guild123",
          userId: "user2",
          title: "Request 2",
          description: "Desc 2",
          status: "approved" as const,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      pagination: {
        total: 2,
        count: 2,
        nextCursor: null,
        hasMore: false,
      },
    };

    it("returns 400 when guildId is missing", async () => {
      const req = createReq({
        params: {},
        session: {
          userId: "superadmin",
          isAdmin: true,
          isSuperAdmin: true,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      await listGuildRequests(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Missing guildId parameter" });
    });

    it("returns 403 when super admin is not a member of the guild", async () => {
      const req = createReq({
        params: { guildId: "other-guild" },
        session: {
          userId: "superadmin",
          isAdmin: true,
          isSuperAdmin: true,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      await listGuildRequests(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "You are not a member of this guild",
        code: "AUTHORIZATION_ERROR",
      });
    });

    it("returns paginated requests for a guild", async () => {
      const req = createReq({
        params: { guildId: "guild123" },
        query: {},
        session: {
          userId: "superadmin",
          isAdmin: true,
          isSuperAdmin: true,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      requestServiceMocks.listRequestsFiltered.mockResolvedValue(mockPaginatedResponse);

      await listGuildRequests(req, res);

      expect(requestServiceMocks.listRequestsFiltered).toHaveBeenCalledWith(
        ["guild123"],
        undefined, // Super admin sees all requests
        expect.objectContaining({ limit: 20, sortDirection: "desc" }),
      );
      expect(res.json).toHaveBeenCalledWith(mockPaginatedResponse);
    });

    it("passes filter parameters correctly", async () => {
      const req = createReq({
        params: { guildId: "guild123" },
        query: { status: "open", cursor: "abc-123", limit: "50", sortDirection: "asc" },
        session: {
          userId: "superadmin",
          isAdmin: true,
          isSuperAdmin: true,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      requestServiceMocks.listRequestsFiltered.mockResolvedValue({
        data: [],
        pagination: { total: 0, count: 0, nextCursor: null, hasMore: false },
      });

      await listGuildRequests(req, res);

      expect(schemaMocks.listRequestsFilterSchema.parse).toHaveBeenCalledWith({
        status: "open",
        cursor: "abc-123",
        limit: "50",
        sortDirection: "asc",
      });
    });

    it("returns empty paginated result when no requests exist", async () => {
      const emptyResponse = {
        data: [],
        pagination: { total: 0, count: 0, nextCursor: null, hasMore: false },
      };

      const req = createReq({
        params: { guildId: "guild123" },
        query: {},
        session: {
          userId: "superadmin",
          isAdmin: true,
          isSuperAdmin: true,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      requestServiceMocks.listRequestsFiltered.mockResolvedValue(emptyResponse);

      await listGuildRequests(req, res);

      expect(res.json).toHaveBeenCalledWith(emptyResponse);
    });

    it("returns 400 for invalid filter parameters", async () => {
      const req = createReq({
        params: { guildId: "guild123" },
        query: { status: "invalid" },
        session: {
          userId: "superadmin",
          isAdmin: true,
          isSuperAdmin: true,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      schemaMocks.listRequestsFilterSchema.parse.mockImplementation(() => {
        throw new ZodError([
          {
            code: "invalid_enum_value",
            received: "invalid",
            path: ["status"],
            message: "Invalid enum value",
            options: ["open", "approved", "denied", "cancelled", "closed"],
          },
        ]);
      });

      await listGuildRequests(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Invalid enum value" });
    });

    it("returns 500 for service errors", async () => {
      const req = createReq({
        params: { guildId: "guild123" },
        query: {},
        session: {
          userId: "superadmin",
          isAdmin: true,
          isSuperAdmin: true,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      requestServiceMocks.listRequestsFiltered.mockRejectedValue(
        new Error("Redis connection failed"),
      );

      await listGuildRequests(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to list requests" });
    });
  });

  describe("getRequestById (super admin)", () => {
    const baseRequest = {
      id: "req123",
      guildId: "guild123",
      userId: "user456",
      title: "Test",
      description: "Desc",
      status: "open" as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const mockComments = [
      {
        id: "comment1",
        requestId: "req123",
        userId: "user456",
        content: "First comment",
        createdAt: Date.now(),
      },
    ];

    it("returns 400 when requestId is missing", async () => {
      const req = createReq({
        params: {},
        session: {
          userId: "superadmin",
          isAdmin: true,
          isSuperAdmin: true,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      await getRequestById(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Missing requestId parameter" });
    });

    it("returns 404 when request does not exist", async () => {
      const req = createReq({
        params: { requestId: "non-existent" },
        session: {
          userId: "superadmin",
          isAdmin: true,
          isSuperAdmin: true,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      requestServiceMocks.getRequest.mockResolvedValue(null);

      await getRequestById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Request not found" });
    });

    it("returns 403 when user cannot view the request", async () => {
      const req = createReq({
        params: { requestId: "req123" },
        session: {
          userId: "superadmin",
          isAdmin: true,
          isSuperAdmin: true,
          guildIds: ["other-guild"],
        } as Request["session"],
      });
      const res = createRes();

      requestServiceMocks.getRequest.mockResolvedValue(baseRequest);
      authorizationMocks.canViewRequest.mockReturnValue(false);

      await getRequestById(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "You do not have permission to view this request",
        code: "AUTHORIZATION_ERROR",
      });
    });

    it("returns request with comments successfully", async () => {
      const req = createReq({
        params: { requestId: "req123" },
        session: {
          userId: "superadmin",
          isAdmin: true,
          isSuperAdmin: true,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      requestServiceMocks.getRequest.mockResolvedValue(baseRequest);
      authorizationMocks.canViewRequest.mockReturnValue(true);
      requestServiceMocks.getComments.mockResolvedValue(mockComments);

      await getRequestById(req, res);

      expect(requestServiceMocks.getRequest).toHaveBeenCalledWith("req123");
      expect(requestServiceMocks.getComments).toHaveBeenCalledWith("req123");
      expect(res.json).toHaveBeenCalledWith({ ...baseRequest, comments: mockComments });
    });

    it("returns 500 for service errors", async () => {
      const req = createReq({
        params: { requestId: "req123" },
        session: {
          userId: "superadmin",
          isAdmin: true,
          isSuperAdmin: true,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      requestServiceMocks.getRequest.mockRejectedValue(new Error("Redis connection failed"));

      await getRequestById(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to get request" });
    });
  });

  describe("changeRequestStatus (super admin)", () => {
    const baseRequest = {
      id: "req123",
      guildId: "guild123",
      userId: "user456",
      title: "Test",
      description: "Desc",
      status: "open" as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    it("returns 400 when requestId is missing", async () => {
      const req = createReq({
        params: {},
        body: { status: "approved" },
        session: {
          userId: "superadmin",
          isAdmin: true,
          isSuperAdmin: true,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      await changeRequestStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Missing requestId parameter" });
    });

    it("returns 404 when request does not exist", async () => {
      const req = createReq({
        params: { requestId: "non-existent" },
        body: { status: "approved" },
        session: {
          userId: "superadmin",
          isAdmin: true,
          isSuperAdmin: true,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      requestServiceMocks.getRequest.mockResolvedValue(null);

      await changeRequestStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Request not found" });
    });

    it("returns 403 when user cannot change request status", async () => {
      const req = createReq({
        params: { requestId: "req123" },
        body: { status: "approved" },
        session: {
          userId: "admin",
          isAdmin: true,
          isSuperAdmin: false,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      requestServiceMocks.getRequest.mockResolvedValue(baseRequest);
      authorizationMocks.canChangeRequestStatus.mockReturnValue(false);

      await changeRequestStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "You do not have permission to change the status of this request",
        code: "AUTHORIZATION_ERROR",
      });
    });

    it("approves request successfully", async () => {
      const approvedRequest = { ...baseRequest, status: "approved" as const };

      const req = createReq({
        params: { requestId: "req123" },
        body: { status: "approved" },
        session: {
          userId: "superadmin",
          isAdmin: true,
          isSuperAdmin: true,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      requestServiceMocks.getRequest.mockResolvedValue(baseRequest);
      authorizationMocks.canChangeRequestStatus.mockReturnValue(true);
      requestServiceMocks.updateRequestStatus.mockResolvedValue(approvedRequest);

      await changeRequestStatus(req, res);

      expect(requestServiceMocks.updateRequestStatus).toHaveBeenCalledWith(
        "req123",
        "approved",
        undefined,
      );
      expect(res.json).toHaveBeenCalledWith(approvedRequest);
    });

    it("closes request with closedBy field", async () => {
      const approvedRequest = { ...baseRequest, status: "approved" as const };
      const closedRequest = {
        ...approvedRequest,
        status: "closed" as const,
        closedAt: Date.now(),
        closedBy: "superadmin",
      };

      const req = createReq({
        params: { requestId: "req123" },
        body: { status: "closed" },
        session: {
          userId: "superadmin",
          isAdmin: true,
          isSuperAdmin: true,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      requestServiceMocks.getRequest.mockResolvedValue(approvedRequest);
      authorizationMocks.canChangeRequestStatus.mockReturnValue(true);
      requestServiceMocks.updateRequestStatus.mockResolvedValue(closedRequest);

      await changeRequestStatus(req, res);

      expect(requestServiceMocks.updateRequestStatus).toHaveBeenCalledWith(
        "req123",
        "closed",
        "superadmin",
      );
      expect(res.json).toHaveBeenCalledWith(closedRequest);
    });

    it("returns 400 for invalid status transition", async () => {
      const req = createReq({
        params: { requestId: "req123" },
        body: { status: "closed" },
        session: {
          userId: "superadmin",
          isAdmin: true,
          isSuperAdmin: true,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      requestServiceMocks.getRequest.mockResolvedValue(baseRequest);
      authorizationMocks.canChangeRequestStatus.mockReturnValue(true);
      requestServiceMocks.updateRequestStatus.mockRejectedValue(
        new Error("Invalid status transition from open to closed"),
      );

      await changeRequestStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Invalid status transition from open to closed",
      });
    });

    it("returns 400 for zod validation errors", async () => {
      const req = createReq({
        params: { requestId: "req123" },
        body: { status: "invalid" },
        session: {
          userId: "superadmin",
          isAdmin: true,
          isSuperAdmin: true,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      schemaMocks.updateRequestStatusSchema.parse.mockImplementation(() => {
        throw new ZodError([
          {
            code: "invalid_enum_value",
            received: "invalid",
            path: ["status"],
            message: "Invalid enum value",
            options: ["open", "approved", "denied", "cancelled", "closed"],
          },
        ]);
      });

      await changeRequestStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Invalid enum value" });
    });

    it("returns 500 for service errors", async () => {
      const req = createReq({
        params: { requestId: "req123" },
        body: { status: "approved" },
        session: {
          userId: "superadmin",
          isAdmin: true,
          isSuperAdmin: true,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      requestServiceMocks.getRequest.mockResolvedValue(baseRequest);
      authorizationMocks.canChangeRequestStatus.mockReturnValue(true);
      requestServiceMocks.updateRequestStatus.mockRejectedValue(
        new Error("Redis connection failed"),
      );

      await changeRequestStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to change request status" });
    });
  });

  describe("deleteRequest (super admin)", () => {
    const baseRequest = {
      id: "req123",
      guildId: "guild123",
      userId: "user456",
      title: "Test",
      description: "Desc",
      status: "open" as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    it("returns 400 when requestId is missing", async () => {
      const req = createReq({
        params: {},
        session: {
          userId: "superadmin",
          isAdmin: true,
          isSuperAdmin: true,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      await deleteRequest(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Missing requestId parameter" });
    });

    it("returns 404 when request does not exist", async () => {
      const req = createReq({
        params: { requestId: "non-existent" },
        session: {
          userId: "superadmin",
          isAdmin: true,
          isSuperAdmin: true,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      requestServiceMocks.getRequest.mockResolvedValue(null);

      await deleteRequest(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Request not found" });
    });

    it("returns 403 when user cannot delete the request", async () => {
      const req = createReq({
        params: { requestId: "req123" },
        session: {
          userId: "admin",
          isAdmin: true,
          isSuperAdmin: false,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      requestServiceMocks.getRequest.mockResolvedValue(baseRequest);
      authorizationMocks.canDeleteRequest.mockReturnValue(false);

      await deleteRequest(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "You do not have permission to delete this request",
        code: "AUTHORIZATION_ERROR",
      });
    });

    it("deletes request successfully", async () => {
      const req = createReq({
        params: { requestId: "req123" },
        session: {
          userId: "superadmin",
          isAdmin: true,
          isSuperAdmin: true,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      requestServiceMocks.getRequest.mockResolvedValue(baseRequest);
      authorizationMocks.canDeleteRequest.mockReturnValue(true);
      requestServiceMocks.deleteRequest.mockResolvedValue(undefined);

      await deleteRequest(req, res);

      expect(requestServiceMocks.deleteRequest).toHaveBeenCalledWith("req123");
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    it("returns 500 for service errors", async () => {
      const req = createReq({
        params: { requestId: "req123" },
        session: {
          userId: "superadmin",
          isAdmin: true,
          isSuperAdmin: true,
          guildIds: ["guild123"],
        } as Request["session"],
      });
      const res = createRes();

      requestServiceMocks.getRequest.mockResolvedValue(baseRequest);
      authorizationMocks.canDeleteRequest.mockReturnValue(true);
      requestServiceMocks.deleteRequest.mockRejectedValue(new Error("Redis connection failed"));

      await deleteRequest(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to delete request" });
    });
  });
});
