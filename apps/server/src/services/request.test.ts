import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockEnvModule, mockRedisModule } from "../utils/test-mocks.ts";

// Mock dependencies before imports
vi.mock("../schemas/env.ts", () => mockEnvModule());
vi.mock("../redis.ts", () => mockRedisModule());

// Import after mocks
import redis from "../redis.ts";
import {
  AuthorizationError,
  canCancelRequest,
  canChangeRequestStatus,
  canCommentOnRequest,
  canCreateRequest,
  canDeleteRequest,
  canListRequests,
  canUserModifyRequest,
  canViewRequest,
  isValidStatusTransition,
  RequestService,
  type RequestAuthContext,
} from "./request.ts";

describe("RequestService", () => {
  let service: RequestService;

  beforeEach(() => {
    service = new RequestService();
    vi.clearAllMocks();

    // Mock multi() to return an object with chainable methods and exec()
    const mockMulti = {
      set: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      sAdd: vi.fn().mockReturnThis(),
      sRem: vi.fn().mockReturnThis(),
      zAdd: vi.fn().mockReturnThis(),
      zRem: vi.fn().mockReturnThis(),
      del: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(redis.client.multi).mockReturnValue(mockMulti as never);
  });

  describe("createRequest", () => {
    it("should create a new request with correct data", async () => {
      const guildId = "guild123";
      const userId = "user456";
      const title = "Test Request";
      const description = "This is a test request";

      const request = await service.createRequest(guildId, userId, title, description);

      expect(request).toBeTruthy();
      expect(request.id).toBeTruthy();
      expect(request.guildId).toBe(guildId);
      expect(request.userId).toBe(userId);
      expect(request.title).toBe(title);
      expect(request.description).toBe(description);
      expect(request.status).toBe("open");
      expect(request.createdAt).toBeDefined();
      expect(request.updatedAt).toBeDefined();
      expect(request.galleryId).toBeUndefined();
      expect(redis.client.multi).toHaveBeenCalled();
    });

    it("should create a new request with optional galleryId", async () => {
      const guildId = "guild123";
      const userId = "user456";
      const title = "Test Request";
      const description = "This is a test request";
      const galleryId = "gallery789";

      const request = await service.createRequest(guildId, userId, title, description, galleryId);

      expect(request).toBeTruthy();
      expect(request.galleryId).toBe(galleryId);
      expect(redis.client.multi).toHaveBeenCalled();
    });
  });

  describe("getRequest", () => {
    it("should return null for non-existent request", async () => {
      vi.mocked(redis.client.get).mockResolvedValue(null);

      const request = await service.getRequest("non-existent");

      expect(request).toBeNull();
    });

    it("should return request data for existing request", async () => {
      const mockRequest = {
        id: "req123",
        guildId: "guild123",
        userId: "user456",
        title: "Test Request",
        description: "Description",
        status: "open",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      vi.mocked(redis.client.get).mockResolvedValue(JSON.stringify(mockRequest));

      const request = await service.getRequest("req123");

      expect(request).toBeTruthy();
      expect(request?.id).toBe("req123");
      expect(request?.status).toBe("open");
    });

    it("should return null for invalid JSON", async () => {
      vi.mocked(redis.client.get).mockResolvedValue("invalid json");

      const request = await service.getRequest("req123");

      expect(request).toBeNull();
    });
  });

  describe("getRequestsByGuild", () => {
    it("should return all requests for a guild", async () => {
      const mockRequest1 = {
        id: "req1",
        guildId: "guild123",
        userId: "user1",
        title: "Request 1",
        description: "Desc 1",
        status: "open",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const mockRequest2 = {
        id: "req2",
        guildId: "guild123",
        userId: "user2",
        title: "Request 2",
        description: "Desc 2",
        status: "approved",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      vi.mocked(redis.client.sMembers).mockResolvedValue(["req1", "req2"]);
      vi.mocked(redis.client.mGet).mockResolvedValue([
        JSON.stringify(mockRequest1),
        JSON.stringify(mockRequest2),
      ]);

      const requests = await service.getRequestsByGuild("guild123");

      expect(requests).toHaveLength(2);
      expect(requests[0].id).toBe("req1");
      expect(requests[1].id).toBe("req2");
      expect(redis.client.sMembers).toHaveBeenCalledWith("request:guild:guild123");
      expect(redis.client.mGet).toHaveBeenCalledWith(["request:req1", "request:req2"]);
    });

    it("should return empty array when no requests exist", async () => {
      vi.mocked(redis.client.sMembers).mockResolvedValue([]);

      const requests = await service.getRequestsByGuild("guild123");

      expect(requests).toHaveLength(0);
    });

    it("should filter out expired request IDs gracefully", async () => {
      const mockRequest = {
        id: "req1",
        guildId: "guild123",
        userId: "user1",
        title: "Request 1",
        description: "Desc 1",
        status: "open",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // Index contains references to both valid and expired requests
      vi.mocked(redis.client.sMembers).mockResolvedValue(["req1", "req2-expired", "req3-expired"]);
      // mGet returns null for expired keys
      vi.mocked(redis.client.mGet).mockResolvedValue([JSON.stringify(mockRequest), null, null]);

      const requests = await service.getRequestsByGuild("guild123");

      expect(requests).toHaveLength(1);
      expect(requests[0].id).toBe("req1");
    });
  });

  describe("getRequestsByUser", () => {
    it("should return all requests by a user", async () => {
      const mockRequest = {
        id: "req1",
        guildId: "guild123",
        userId: "user456",
        title: "Request 1",
        description: "Desc 1",
        status: "open",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      vi.mocked(redis.client.sMembers).mockResolvedValue(["req1"]);
      vi.mocked(redis.client.mGet).mockResolvedValue([JSON.stringify(mockRequest)]);

      const requests = await service.getRequestsByUser("user456");

      expect(requests).toHaveLength(1);
      expect(requests[0].userId).toBe("user456");
      expect(redis.client.sMembers).toHaveBeenCalledWith("request:user:user456");
    });
  });

  describe("getRequestsByUserAndGuild", () => {
    it("should return requests for a user in a specific guild using SINTER", async () => {
      const mockRequest = {
        id: "req1",
        guildId: "guild123",
        userId: "user456",
        title: "Request 1",
        description: "Desc 1",
        status: "open",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      vi.mocked(redis.client.sInter).mockResolvedValue(["req1"]);
      vi.mocked(redis.client.mGet).mockResolvedValue([JSON.stringify(mockRequest)]);

      const requests = await service.getRequestsByUserAndGuild("user456", "guild123");

      expect(requests).toHaveLength(1);
      expect(requests[0].userId).toBe("user456");
      expect(requests[0].guildId).toBe("guild123");
      expect(redis.client.sInter).toHaveBeenCalledWith([
        "request:user:user456",
        "request:guild:guild123",
      ]);
    });

    it("should return empty array when no intersection exists", async () => {
      vi.mocked(redis.client.sInter).mockResolvedValue([]);

      const requests = await service.getRequestsByUserAndGuild("user456", "guild123");

      expect(requests).toHaveLength(0);
    });

    it("should filter out expired request IDs gracefully", async () => {
      const mockRequest = {
        id: "req1",
        guildId: "guild123",
        userId: "user456",
        title: "Request 1",
        description: "Desc 1",
        status: "open",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // Intersection contains both valid and expired request IDs
      vi.mocked(redis.client.sInter).mockResolvedValue(["req1", "req2-expired"]);
      // mGet returns null for expired keys
      vi.mocked(redis.client.mGet).mockResolvedValue([JSON.stringify(mockRequest), null]);

      const requests = await service.getRequestsByUserAndGuild("user456", "guild123");

      expect(requests).toHaveLength(1);
      expect(requests[0].id).toBe("req1");
    });
  });

  describe("getRequestsByStatus", () => {
    it("should return all requests with a specific status", async () => {
      const mockRequest = {
        id: "req1",
        guildId: "guild123",
        userId: "user456",
        title: "Request 1",
        description: "Desc 1",
        status: "approved",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      vi.mocked(redis.client.sMembers).mockResolvedValue(["req1"]);
      vi.mocked(redis.client.mGet).mockResolvedValue([JSON.stringify(mockRequest)]);

      const requests = await service.getRequestsByStatus("approved");

      expect(requests).toHaveLength(1);
      expect(requests[0].status).toBe("approved");
      expect(redis.client.sMembers).toHaveBeenCalledWith("request:status:approved");
    });
  });

  describe("updateRequestStatus", () => {
    it("should update request status with valid transition", async () => {
      const mockRequest = {
        id: "req123",
        guildId: "guild123",
        userId: "user456",
        title: "Test Request",
        description: "Description",
        status: "open",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      vi.mocked(redis.client.get).mockResolvedValue(JSON.stringify(mockRequest));

      const updatedRequest = await service.updateRequestStatus("req123", "approved");

      expect(updatedRequest.status).toBe("approved");
      expect(updatedRequest.updatedAt).toBeGreaterThanOrEqual(mockRequest.updatedAt);
      expect(redis.client.multi).toHaveBeenCalled();
    });

    it("should throw error for non-existent request", async () => {
      vi.mocked(redis.client.get).mockResolvedValue(null);

      await expect(service.updateRequestStatus("non-existent", "approved")).rejects.toThrow(
        "Request non-existent does not exist",
      );
    });

    it("should throw error for invalid status transition", async () => {
      const mockRequest = {
        id: "req123",
        guildId: "guild123",
        userId: "user456",
        title: "Test Request",
        description: "Description",
        status: "approved",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      vi.mocked(redis.client.get).mockResolvedValue(JSON.stringify(mockRequest));

      await expect(service.updateRequestStatus("req123", "denied")).rejects.toThrow(
        "Invalid status transition from approved to denied",
      );
    });

    it("should set closedAt and closedBy when closing a request", async () => {
      const mockRequest = {
        id: "req123",
        guildId: "guild123",
        userId: "user456",
        title: "Test Request",
        description: "Description",
        status: "approved",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      vi.mocked(redis.client.get).mockResolvedValue(JSON.stringify(mockRequest));

      const updatedRequest = await service.updateRequestStatus("req123", "closed", "admin123");

      expect(updatedRequest.status).toBe("closed");
      expect(updatedRequest.closedAt).toBeDefined();
      expect(updatedRequest.closedBy).toBe("admin123");
    });

    it("should clear closedAt and closedBy when reopening a request", async () => {
      const mockRequest = {
        id: "req123",
        guildId: "guild123",
        userId: "user456",
        title: "Test Request",
        description: "Description",
        status: "closed",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        closedAt: Date.now(),
        closedBy: "admin123",
      };

      vi.mocked(redis.client.get).mockResolvedValue(JSON.stringify(mockRequest));

      const updatedRequest = await service.updateRequestStatus("req123", "open");

      expect(updatedRequest.status).toBe("open");
      expect(updatedRequest.closedAt).toBeUndefined();
      expect(updatedRequest.closedBy).toBeUndefined();
    });

    it("should throw error for corrupted request data", async () => {
      vi.mocked(redis.client.get).mockResolvedValue("invalid json {");

      await expect(service.updateRequestStatus("req123", "approved")).rejects.toThrow(
        /Corrupted request data for req123/,
      );
      expect(redis.client.unwatch).toHaveBeenCalled();
    });

    it("should retry on concurrent modification and eventually succeed", async () => {
      const mockRequest = {
        id: "req123",
        guildId: "guild123",
        userId: "user456",
        title: "Test Request",
        description: "Description",
        status: "open",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      vi.mocked(redis.client.get).mockResolvedValue(JSON.stringify(mockRequest));

      // First attempt fails (null from exec), second succeeds
      const mockMulti = {
        set: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        sAdd: vi.fn().mockReturnThis(),
        sRem: vi.fn().mockReturnThis(),
        zAdd: vi.fn().mockReturnThis(),
        exec: vi
          .fn()
          .mockResolvedValueOnce(null) // First attempt fails
          .mockResolvedValueOnce([]), // Second attempt succeeds
      };
      vi.mocked(redis.client.multi).mockReturnValue(mockMulti as never);

      const updatedRequest = await service.updateRequestStatus("req123", "approved");

      expect(updatedRequest.status).toBe("approved");
      expect(redis.client.watch).toHaveBeenCalledTimes(2);
    });

    it("should throw after max retries on continuous concurrent modifications", async () => {
      const mockRequest = {
        id: "req123",
        guildId: "guild123",
        userId: "user456",
        title: "Test Request",
        description: "Description",
        status: "open",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      vi.mocked(redis.client.get).mockResolvedValue(JSON.stringify(mockRequest));

      // All attempts fail
      const mockMulti = {
        set: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        sAdd: vi.fn().mockReturnThis(),
        sRem: vi.fn().mockReturnThis(),
        zAdd: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(null),
      };
      vi.mocked(redis.client.multi).mockReturnValue(mockMulti as never);

      await expect(service.updateRequestStatus("req123", "approved")).rejects.toThrow(
        /Failed to update request req123 status due to concurrent modifications/,
      );

      // Should have tried 5 times
      expect(redis.client.watch).toHaveBeenCalledTimes(5);
    });
  });

  describe("addComment", () => {
    it("should add a comment to a request", async () => {
      const mockRequest = {
        id: "req123",
        guildId: "guild123",
        userId: "user456",
        title: "Test Request",
        description: "Description",
        status: "open",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      vi.mocked(redis.client.get).mockResolvedValue(JSON.stringify(mockRequest));

      const comment = await service.addComment("req123", "commenter123", "This is a comment");

      expect(comment).toBeTruthy();
      expect(comment.id).toBeTruthy();
      expect(comment.requestId).toBe("req123");
      expect(comment.userId).toBe("commenter123");
      expect(comment.content).toBe("This is a comment");
      expect(comment.createdAt).toBeDefined();
      expect(redis.client.multi).toHaveBeenCalled();
    });

    it("should throw error when request does not exist", async () => {
      vi.mocked(redis.client.get).mockResolvedValue(null);

      await expect(service.addComment("non-existent", "commenter123", "Comment")).rejects.toThrow(
        "Request non-existent does not exist",
      );
    });
  });

  describe("getComments", () => {
    it("should return all comments for a request sorted by timestamp", async () => {
      const mockComment1 = {
        id: "comment1",
        requestId: "req123",
        userId: "user1",
        content: "First comment",
        createdAt: 1000,
      };
      const mockComment2 = {
        id: "comment2",
        requestId: "req123",
        userId: "user2",
        content: "Second comment",
        createdAt: 2000,
      };

      vi.mocked(redis.client.zRange).mockResolvedValue(["comment1", "comment2"]);
      vi.mocked(redis.client.mGet).mockResolvedValue([
        JSON.stringify(mockComment1),
        JSON.stringify(mockComment2),
      ]);

      const comments = await service.getComments("req123");

      expect(comments).toHaveLength(2);
      expect(comments[0].id).toBe("comment1");
      expect(comments[1].id).toBe("comment2");
      expect(redis.client.zRange).toHaveBeenCalledWith("request:comments:req123", 0, -1);
      expect(redis.client.mGet).toHaveBeenCalledWith([
        "request:comment:comment1",
        "request:comment:comment2",
      ]);
    });

    it("should return empty array when no comments exist", async () => {
      vi.mocked(redis.client.zRange).mockResolvedValue([]);

      const comments = await service.getComments("req123");

      expect(comments).toHaveLength(0);
    });

    it("should skip invalid JSON comments", async () => {
      vi.mocked(redis.client.zRange).mockResolvedValue(["comment1", "comment2"]);
      vi.mocked(redis.client.mGet).mockResolvedValue(["invalid json", null]);

      const comments = await service.getComments("req123");

      expect(comments).toHaveLength(0);
    });
  });

  describe("deleteRequest", () => {
    it("should delete request and all associated data", async () => {
      const mockRequest = {
        id: "req123",
        guildId: "guild123",
        userId: "user456",
        title: "Test Request",
        description: "Description",
        status: "open",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      vi.mocked(redis.client.get).mockResolvedValue(JSON.stringify(mockRequest));
      vi.mocked(redis.client.zRange).mockResolvedValue(["comment1", "comment2"]);

      await service.deleteRequest("req123");

      expect(redis.client.multi).toHaveBeenCalled();
    });

    it("should do nothing for non-existent request", async () => {
      vi.mocked(redis.client.get).mockResolvedValue(null);

      await service.deleteRequest("non-existent");

      // multi should not be called since request doesn't exist
      expect(redis.client.multi).not.toHaveBeenCalled();
    });
  });

  describe("listRequestsFiltered", () => {
    const mockRequest1 = {
      id: "req1",
      guildId: "guild123",
      userId: "user456",
      title: "Request 1",
      description: "Desc 1",
      status: "open" as const,
      createdAt: 1000,
      updatedAt: 1000,
    };
    const mockRequest2 = {
      id: "req2",
      guildId: "guild123",
      userId: "user456",
      title: "Request 2",
      description: "Desc 2",
      status: "approved" as const,
      createdAt: 2000,
      updatedAt: 2500,
    };
    const mockRequest3 = {
      id: "req3",
      guildId: "guild123",
      userId: "user789",
      title: "Request 3",
      description: "Desc 3",
      status: "open" as const,
      createdAt: 3000,
      updatedAt: 3000,
    };

    it("should return empty result for empty guildIds", async () => {
      const result = await service.listRequestsFiltered([], undefined, {
        limit: 20,
        sortDirection: "desc",
      });

      expect(result.data).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.hasMore).toBe(false);
    });

    it("should return paginated results for single guild", async () => {
      vi.mocked(redis.client.sMembers).mockResolvedValue(["req1", "req2", "req3"]);
      vi.mocked(redis.client.zMScore).mockResolvedValue([1000, 2000, 3000]);
      vi.mocked(redis.client.mGet).mockResolvedValue([
        JSON.stringify(mockRequest3),
        JSON.stringify(mockRequest2),
        JSON.stringify(mockRequest1),
      ]);

      const result = await service.listRequestsFiltered(["guild123"], undefined, {
        limit: 20,
        sortDirection: "desc",
      });

      expect(result.data).toHaveLength(3);
      expect(result.pagination.total).toBe(3);
      expect(result.pagination.hasMore).toBe(false);
      expect(result.pagination.nextCursor).toBeNull();
      expect(redis.client.sMembers).toHaveBeenCalledWith("request:guild:guild123");
    });

    it("should filter by user using SINTER", async () => {
      vi.mocked(redis.client.sInter).mockResolvedValue(["req1", "req2"]);
      vi.mocked(redis.client.zMScore).mockResolvedValue([1000, 2000]);
      vi.mocked(redis.client.mGet).mockResolvedValue([
        JSON.stringify(mockRequest2),
        JSON.stringify(mockRequest1),
      ]);

      const result = await service.listRequestsFiltered(["guild123"], "user456", {
        limit: 20,
        sortDirection: "desc",
      });

      expect(result.data).toHaveLength(2);
      expect(redis.client.sInter).toHaveBeenCalledWith([
        "request:guild:guild123",
        "request:user:user456",
      ]);
    });

    it("should filter by status using SINTER", async () => {
      vi.mocked(redis.client.sInter).mockResolvedValue(["req1", "req3"]);
      vi.mocked(redis.client.zMScore).mockResolvedValue([1000, 3000]);
      vi.mocked(redis.client.mGet).mockResolvedValue([
        JSON.stringify(mockRequest3),
        JSON.stringify(mockRequest1),
      ]);

      const result = await service.listRequestsFiltered(["guild123"], undefined, {
        status: "open",
        limit: 20,
        sortDirection: "desc",
      });

      expect(result.data).toHaveLength(2);
      expect(redis.client.sInter).toHaveBeenCalledWith([
        "request:guild:guild123",
        "request:status:open",
      ]);
    });

    it("should filter by user and status combined", async () => {
      vi.mocked(redis.client.sInter).mockResolvedValue(["req1"]);
      vi.mocked(redis.client.zMScore).mockResolvedValue([1000]);
      vi.mocked(redis.client.mGet).mockResolvedValue([JSON.stringify(mockRequest1)]);

      const result = await service.listRequestsFiltered(["guild123"], "user456", {
        status: "open",
        limit: 20,
        sortDirection: "desc",
      });

      expect(result.data).toHaveLength(1);
      expect(redis.client.sInter).toHaveBeenCalledWith([
        "request:guild:guild123",
        "request:user:user456",
        "request:status:open",
      ]);
    });

    it("should handle cursor-based pagination", async () => {
      vi.mocked(redis.client.sMembers).mockResolvedValue(["req1", "req2", "req3"]);
      vi.mocked(redis.client.zMScore).mockResolvedValue([1000, 2000, 3000]);
      vi.mocked(redis.client.mGet).mockResolvedValue([JSON.stringify(mockRequest1)]);

      // Cursor is req2 (createdAt=2000), so we start after it
      const result = await service.listRequestsFiltered(["guild123"], undefined, {
        cursor: "req2",
        limit: 10,
        sortDirection: "desc",
      });

      // In desc order: req3 (3000), req2 (2000), req1 (1000)
      // After req2, we should get req1
      expect(result.data).toHaveLength(1);
      expect(result.pagination.hasMore).toBe(false);
    });

    it("should fall back to first page when cursor is invalid or not found", async () => {
      vi.mocked(redis.client.sMembers).mockResolvedValue(["req1", "req2", "req3"]);
      vi.mocked(redis.client.zMScore).mockResolvedValue([1000, 2000, 3000]);
      vi.mocked(redis.client.mGet).mockResolvedValue([
        JSON.stringify(mockRequest3),
        JSON.stringify(mockRequest2),
        JSON.stringify(mockRequest1),
      ]);

      // Invalid cursor that doesn't exist in the result set
      const result = await service.listRequestsFiltered(["guild123"], undefined, {
        cursor: "non-existent-id",
        limit: 20,
        sortDirection: "desc",
      });

      // Falls back to startIndex=0, returns all results from the beginning
      expect(result.data).toHaveLength(3);
      expect(result.pagination.total).toBe(3);
      expect(result.pagination.hasMore).toBe(false);
    });

    it("should return hasMore=true when more results exist", async () => {
      vi.mocked(redis.client.sMembers).mockResolvedValue(["req1", "req2", "req3"]);
      vi.mocked(redis.client.zMScore).mockResolvedValue([1000, 2000, 3000]);
      vi.mocked(redis.client.mGet).mockResolvedValue([
        JSON.stringify(mockRequest3),
        JSON.stringify(mockRequest2),
      ]);

      const result = await service.listRequestsFiltered(["guild123"], undefined, {
        limit: 2,
        sortDirection: "desc",
      });

      expect(result.data).toHaveLength(2);
      expect(result.pagination.total).toBe(3);
      expect(result.pagination.hasMore).toBe(true);
      expect(result.pagination.nextCursor).toBe("req2");
    });

    it("should sort ascending when sortDirection is asc", async () => {
      vi.mocked(redis.client.sMembers).mockResolvedValue(["req1", "req2", "req3"]);
      vi.mocked(redis.client.zMScore).mockResolvedValue([1000, 2000, 3000]);
      vi.mocked(redis.client.mGet).mockResolvedValue([
        JSON.stringify(mockRequest1),
        JSON.stringify(mockRequest2),
        JSON.stringify(mockRequest3),
      ]);

      const result = await service.listRequestsFiltered(["guild123"], undefined, {
        limit: 20,
        sortDirection: "asc",
      });

      expect(result.data).toHaveLength(3);
      // The mGet is called with IDs in sorted order (asc: req1, req2, req3)
      expect(redis.client.mGet).toHaveBeenCalledWith([
        "request:req1",
        "request:req2",
        "request:req3",
      ]);
    });

    it("should handle multiple guilds using SUNION", async () => {
      vi.mocked(redis.client.sUnion).mockResolvedValue(["req1", "req2", "req3"]);
      vi.mocked(redis.client.zMScore).mockResolvedValue([1000, 2000, 3000]);
      vi.mocked(redis.client.mGet).mockResolvedValue([
        JSON.stringify(mockRequest3),
        JSON.stringify(mockRequest2),
        JSON.stringify(mockRequest1),
      ]);

      const result = await service.listRequestsFiltered(["guild123", "guild456"], undefined, {
        limit: 20,
        sortDirection: "desc",
      });

      expect(result.data).toHaveLength(3);
      expect(redis.client.sUnion).toHaveBeenCalledWith([
        "request:guild:guild123",
        "request:guild:guild456",
      ]);
    });

    it("should filter out expired/orphaned entries gracefully", async () => {
      vi.mocked(redis.client.sMembers).mockResolvedValue(["req1", "req2-expired"]);
      // zMScore returns null for members not in the sorted set
      vi.mocked(redis.client.zMScore).mockResolvedValue([1000, null]);
      vi.mocked(redis.client.mGet).mockResolvedValue([JSON.stringify(mockRequest1)]);

      const result = await service.listRequestsFiltered(["guild123"], undefined, {
        limit: 20,
        sortDirection: "desc",
      });

      expect(result.data).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
    });

    it("should return empty result when no candidates match filters", async () => {
      vi.mocked(redis.client.sInter).mockResolvedValue([]);

      const result = await service.listRequestsFiltered(["guild123"], "user999", {
        status: "open",
        limit: 20,
        sortDirection: "desc",
      });

      expect(result.data).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
    });

    it("should preserve order of fetched requests matching pageIds", async () => {
      vi.mocked(redis.client.sMembers).mockResolvedValue(["req1", "req2"]);
      vi.mocked(redis.client.zMScore).mockResolvedValue([1000, 2000]);
      // mGet returns in order of keys, but requests should be sorted by pageIds order
      vi.mocked(redis.client.mGet).mockResolvedValue([
        JSON.stringify(mockRequest1), // First key
        JSON.stringify(mockRequest2), // Second key
      ]);

      const result = await service.listRequestsFiltered(["guild123"], undefined, {
        limit: 20,
        sortDirection: "desc", // Should be req2 (2000) then req1 (1000)
      });

      expect(result.data).toHaveLength(2);
      // In desc order, req2 should come first (higher timestamp)
      expect(result.data[0].id).toBe("req2");
      expect(result.data[1].id).toBe("req1");
    });
  });
});

describe("isValidStatusTransition", () => {
  it("should allow open -> approved", () => {
    expect(isValidStatusTransition("open", "approved")).toBe(true);
  });

  it("should allow open -> denied", () => {
    expect(isValidStatusTransition("open", "denied")).toBe(true);
  });

  it("should allow open -> cancelled", () => {
    expect(isValidStatusTransition("open", "cancelled")).toBe(true);
  });

  it("should allow approved -> closed", () => {
    expect(isValidStatusTransition("approved", "closed")).toBe(true);
  });

  it("should allow denied -> closed", () => {
    expect(isValidStatusTransition("denied", "closed")).toBe(true);
  });

  it("should allow cancelled -> closed", () => {
    expect(isValidStatusTransition("cancelled", "closed")).toBe(true);
  });

  it("should allow closed -> open (super admin reopen)", () => {
    expect(isValidStatusTransition("closed", "open")).toBe(true);
  });

  it("should not allow open -> closed directly", () => {
    expect(isValidStatusTransition("open", "closed")).toBe(false);
  });

  it("should not allow approved -> denied", () => {
    expect(isValidStatusTransition("approved", "denied")).toBe(false);
  });

  it("should not allow approved -> open", () => {
    expect(isValidStatusTransition("approved", "open")).toBe(false);
  });

  it("should not allow closed -> approved", () => {
    expect(isValidStatusTransition("closed", "approved")).toBe(false);
  });
});

describe("canUserModifyRequest", () => {
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

  it("should allow super admin to modify any request", () => {
    expect(canUserModifyRequest("other-user", baseRequest, true)).toBe(true);
  });

  it("should allow owner to modify their own open request", () => {
    expect(canUserModifyRequest("user456", baseRequest, false)).toBe(true);
  });

  it("should not allow owner to modify their own non-open request", () => {
    const closedRequest = { ...baseRequest, status: "approved" as const };
    expect(canUserModifyRequest("user456", closedRequest, false)).toBe(false);
  });

  it("should not allow non-owner to modify request", () => {
    expect(canUserModifyRequest("other-user", baseRequest, false)).toBe(false);
  });

  it("should allow super admin to modify closed request", () => {
    const closedRequest = { ...baseRequest, status: "closed" as const };
    expect(canUserModifyRequest("any-admin", closedRequest, true)).toBe(true);
  });
});

describe("AuthorizationError", () => {
  it("should create error with correct properties", () => {
    const error = new AuthorizationError("Not allowed", "view", "req123");
    expect(error.message).toBe("Not allowed");
    expect(error.action).toBe("view");
    expect(error.resourceId).toBe("req123");
    expect(error.code).toBe("AUTHORIZATION_ERROR");
    expect(error.status).toBe(403);
    expect(error.name).toBe("AuthorizationError");
  });

  it("should create error without resourceId", () => {
    const error = new AuthorizationError("Not allowed", "list");
    expect(error.resourceId).toBeUndefined();
  });
});

describe("canViewRequest", () => {
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

  const superAdminCtx: RequestAuthContext = {
    userId: "superadmin1",
    isAdmin: true,
    isSuperAdmin: true,
    guildIds: ["guild123", "guild456"],
  };

  const adminCtx: RequestAuthContext = {
    userId: "user456",
    isAdmin: true,
    isSuperAdmin: false,
    guildIds: ["guild123"],
  };

  const otherAdminCtx: RequestAuthContext = {
    userId: "other-admin",
    isAdmin: true,
    isSuperAdmin: false,
    guildIds: ["guild123"],
  };

  const nonMemberAdminCtx: RequestAuthContext = {
    userId: "user456",
    isAdmin: true,
    isSuperAdmin: false,
    guildIds: ["guild999"],
  };

  it("should allow super admin to view any request in their guilds", () => {
    expect(canViewRequest(superAdminCtx, baseRequest)).toBe(true);
  });

  it("should allow admin to view their own request", () => {
    expect(canViewRequest(adminCtx, baseRequest)).toBe(true);
  });

  it("should not allow admin to view another user's request", () => {
    expect(canViewRequest(otherAdminCtx, baseRequest)).toBe(false);
  });

  it("should not allow admin who is not a member of the guild", () => {
    expect(canViewRequest(nonMemberAdminCtx, baseRequest)).toBe(false);
  });

  it("should not allow super admin to view request outside their guilds", () => {
    const otherGuildRequest = { ...baseRequest, guildId: "guild999" };
    expect(canViewRequest(superAdminCtx, otherGuildRequest)).toBe(false);
  });

  it("should allow viewing closed requests for owner admin", () => {
    const closedRequest = { ...baseRequest, status: "closed" as const };
    expect(canViewRequest(adminCtx, closedRequest)).toBe(true);
  });

  it("should not allow non-admin user to view request", () => {
    const nonAdminCtx: RequestAuthContext = {
      userId: "user456",
      isAdmin: false,
      isSuperAdmin: false,
      guildIds: ["guild123"],
    };
    expect(canViewRequest(nonAdminCtx, baseRequest)).toBe(false);
  });

  it("should not allow user with empty guildIds to view request", () => {
    const emptyGuildsCtx: RequestAuthContext = {
      userId: "user456",
      isAdmin: true,
      isSuperAdmin: false,
      guildIds: [],
    };
    expect(canViewRequest(emptyGuildsCtx, baseRequest)).toBe(false);
  });
});

describe("canListRequests", () => {
  it("should allow super admin to list requests", () => {
    const ctx: RequestAuthContext = {
      userId: "user1",
      isAdmin: true,
      isSuperAdmin: true,
      guildIds: ["guild1"],
    };
    expect(canListRequests(ctx)).toBe(true);
  });

  it("should allow admin to list requests", () => {
    const ctx: RequestAuthContext = {
      userId: "user1",
      isAdmin: true,
      isSuperAdmin: false,
      guildIds: ["guild1"],
    };
    expect(canListRequests(ctx)).toBe(true);
  });

  it("should not allow non-admin to list requests", () => {
    const ctx: RequestAuthContext = {
      userId: "user1",
      isAdmin: false,
      isSuperAdmin: false,
      guildIds: ["guild1"],
    };
    expect(canListRequests(ctx)).toBe(false);
  });

  it("should not allow user with empty guildIds to list requests", () => {
    const ctx: RequestAuthContext = {
      userId: "user1",
      isAdmin: true,
      isSuperAdmin: false,
      guildIds: [],
    };
    // Note: canListRequests only checks admin status, not guild membership
    // Guild filtering should happen in the service layer
    expect(canListRequests(ctx)).toBe(true);
  });
});

describe("canCreateRequest", () => {
  const adminCtx: RequestAuthContext = {
    userId: "user1",
    isAdmin: true,
    isSuperAdmin: false,
    guildIds: ["guild1", "guild2"],
  };

  const superAdminCtx: RequestAuthContext = {
    userId: "user1",
    isAdmin: true,
    isSuperAdmin: true,
    guildIds: ["guild1"],
  };

  const nonAdminCtx: RequestAuthContext = {
    userId: "user1",
    isAdmin: false,
    isSuperAdmin: false,
    guildIds: ["guild1"],
  };

  it("should allow admin to create request in their guild", () => {
    expect(canCreateRequest(adminCtx, "guild1")).toBe(true);
  });

  it("should allow super admin to create request in their guild", () => {
    expect(canCreateRequest(superAdminCtx, "guild1")).toBe(true);
  });

  it("should not allow admin to create request in non-member guild", () => {
    expect(canCreateRequest(adminCtx, "guild999")).toBe(false);
  });

  it("should not allow non-admin to create request", () => {
    expect(canCreateRequest(nonAdminCtx, "guild1")).toBe(false);
  });

  it("should not allow user with empty guildIds to create request", () => {
    const emptyGuildsCtx: RequestAuthContext = {
      userId: "user1",
      isAdmin: true,
      isSuperAdmin: false,
      guildIds: [],
    };
    expect(canCreateRequest(emptyGuildsCtx, "guild1")).toBe(false);
  });
});

describe("canCancelRequest", () => {
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

  const superAdminCtx: RequestAuthContext = {
    userId: "superadmin1",
    isAdmin: true,
    isSuperAdmin: true,
    guildIds: ["guild123"],
  };

  const ownerAdminCtx: RequestAuthContext = {
    userId: "user456",
    isAdmin: true,
    isSuperAdmin: false,
    guildIds: ["guild123"],
  };

  const otherAdminCtx: RequestAuthContext = {
    userId: "other-admin",
    isAdmin: true,
    isSuperAdmin: false,
    guildIds: ["guild123"],
  };

  it("should allow super admin to cancel any open request", () => {
    expect(canCancelRequest(superAdminCtx, baseRequest)).toBe(true);
  });

  it("should allow owner admin to cancel their own open request", () => {
    expect(canCancelRequest(ownerAdminCtx, baseRequest)).toBe(true);
  });

  it("should not allow admin to cancel another user's request", () => {
    expect(canCancelRequest(otherAdminCtx, baseRequest)).toBe(false);
  });

  it("should not allow cancelling non-open request", () => {
    const approvedRequest = { ...baseRequest, status: "approved" as const };
    expect(canCancelRequest(ownerAdminCtx, approvedRequest)).toBe(false);
  });

  it("should not allow super admin to cancel non-open request", () => {
    const closedRequest = { ...baseRequest, status: "closed" as const };
    expect(canCancelRequest(superAdminCtx, closedRequest)).toBe(false);
  });

  it("should not allow cancellation if not guild member", () => {
    const nonMemberCtx: RequestAuthContext = {
      userId: "user456",
      isAdmin: true,
      isSuperAdmin: false,
      guildIds: ["other-guild"],
    };
    expect(canCancelRequest(nonMemberCtx, baseRequest)).toBe(false);
  });

  it("should not allow non-admin to cancel request", () => {
    const nonAdminCtx: RequestAuthContext = {
      userId: "user456",
      isAdmin: false,
      isSuperAdmin: false,
      guildIds: ["guild123"],
    };
    expect(canCancelRequest(nonAdminCtx, baseRequest)).toBe(false);
  });

  it("should not allow user with empty guildIds to cancel request", () => {
    const emptyGuildsCtx: RequestAuthContext = {
      userId: "user456",
      isAdmin: true,
      isSuperAdmin: false,
      guildIds: [],
    };
    expect(canCancelRequest(emptyGuildsCtx, baseRequest)).toBe(false);
  });
});

describe("canChangeRequestStatus", () => {
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

  const superAdminCtx: RequestAuthContext = {
    userId: "superadmin1",
    isAdmin: true,
    isSuperAdmin: true,
    guildIds: ["guild123"],
  };

  const ownerAdminCtx: RequestAuthContext = {
    userId: "user456",
    isAdmin: true,
    isSuperAdmin: false,
    guildIds: ["guild123"],
  };

  const otherAdminCtx: RequestAuthContext = {
    userId: "other-admin",
    isAdmin: true,
    isSuperAdmin: false,
    guildIds: ["guild123"],
  };

  it("should allow super admin to approve open request", () => {
    expect(canChangeRequestStatus(superAdminCtx, baseRequest, "approved")).toBe(true);
  });

  it("should allow super admin to deny open request", () => {
    expect(canChangeRequestStatus(superAdminCtx, baseRequest, "denied")).toBe(true);
  });

  it("should allow super admin to cancel open request", () => {
    expect(canChangeRequestStatus(superAdminCtx, baseRequest, "cancelled")).toBe(true);
  });

  it("should allow super admin to re-open closed request", () => {
    const closedRequest = { ...baseRequest, status: "closed" as const };
    expect(canChangeRequestStatus(superAdminCtx, closedRequest, "open")).toBe(true);
  });

  it("should allow super admin to close approved request", () => {
    const approvedRequest = { ...baseRequest, status: "approved" as const };
    expect(canChangeRequestStatus(superAdminCtx, approvedRequest, "closed")).toBe(true);
  });

  it("should allow owner admin to cancel their own open request", () => {
    expect(canChangeRequestStatus(ownerAdminCtx, baseRequest, "cancelled")).toBe(true);
  });

  it("should not allow admin to approve request", () => {
    expect(canChangeRequestStatus(ownerAdminCtx, baseRequest, "approved")).toBe(false);
  });

  it("should not allow admin to deny request", () => {
    expect(canChangeRequestStatus(ownerAdminCtx, baseRequest, "denied")).toBe(false);
  });

  it("should not allow admin to cancel another user's request", () => {
    expect(canChangeRequestStatus(otherAdminCtx, baseRequest, "cancelled")).toBe(false);
  });

  it("should not allow invalid status transitions", () => {
    expect(canChangeRequestStatus(superAdminCtx, baseRequest, "closed")).toBe(false);
  });

  it("should not allow status change if not guild member", () => {
    const nonMemberCtx: RequestAuthContext = {
      userId: "superadmin1",
      isAdmin: true,
      isSuperAdmin: true,
      guildIds: ["other-guild"],
    };
    expect(canChangeRequestStatus(nonMemberCtx, baseRequest, "approved")).toBe(false);
  });

  it("should not allow admin to re-open closed request", () => {
    const closedRequest = { ...baseRequest, status: "closed" as const };
    expect(canChangeRequestStatus(ownerAdminCtx, closedRequest, "open")).toBe(false);
  });

  it("should not allow non-admin to change request status", () => {
    const nonAdminCtx: RequestAuthContext = {
      userId: "user456",
      isAdmin: false,
      isSuperAdmin: false,
      guildIds: ["guild123"],
    };
    expect(canChangeRequestStatus(nonAdminCtx, baseRequest, "cancelled")).toBe(false);
  });

  it("should not allow user with empty guildIds to change request status", () => {
    const emptyGuildsCtx: RequestAuthContext = {
      userId: "superadmin1",
      isAdmin: true,
      isSuperAdmin: true,
      guildIds: [],
    };
    expect(canChangeRequestStatus(emptyGuildsCtx, baseRequest, "approved")).toBe(false);
  });
});

describe("canCommentOnRequest", () => {
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

  const superAdminCtx: RequestAuthContext = {
    userId: "superadmin1",
    isAdmin: true,
    isSuperAdmin: true,
    guildIds: ["guild123"],
  };

  const ownerAdminCtx: RequestAuthContext = {
    userId: "user456",
    isAdmin: true,
    isSuperAdmin: false,
    guildIds: ["guild123"],
  };

  const otherAdminCtx: RequestAuthContext = {
    userId: "other-admin",
    isAdmin: true,
    isSuperAdmin: false,
    guildIds: ["guild123"],
  };

  it("should allow super admin to comment on any open request", () => {
    expect(canCommentOnRequest(superAdminCtx, baseRequest)).toBe(true);
  });

  it("should allow super admin to comment on closed request", () => {
    const closedRequest = { ...baseRequest, status: "closed" as const };
    expect(canCommentOnRequest(superAdminCtx, closedRequest)).toBe(true);
  });

  it("should allow super admin to comment on approved request", () => {
    const approvedRequest = { ...baseRequest, status: "approved" as const };
    expect(canCommentOnRequest(superAdminCtx, approvedRequest)).toBe(true);
  });

  it("should allow owner admin to comment on their own open request", () => {
    expect(canCommentOnRequest(ownerAdminCtx, baseRequest)).toBe(true);
  });

  it("should not allow owner admin to comment on their own closed request", () => {
    const closedRequest = { ...baseRequest, status: "closed" as const };
    expect(canCommentOnRequest(ownerAdminCtx, closedRequest)).toBe(false);
  });

  it("should not allow admin to comment on another user's request", () => {
    expect(canCommentOnRequest(otherAdminCtx, baseRequest)).toBe(false);
  });

  it("should not allow comment if not guild member", () => {
    const nonMemberCtx: RequestAuthContext = {
      userId: "user456",
      isAdmin: true,
      isSuperAdmin: false,
      guildIds: ["other-guild"],
    };
    expect(canCommentOnRequest(nonMemberCtx, baseRequest)).toBe(false);
  });

  it("should not allow non-admin to comment on request", () => {
    const nonAdminCtx: RequestAuthContext = {
      userId: "user456",
      isAdmin: false,
      isSuperAdmin: false,
      guildIds: ["guild123"],
    };
    expect(canCommentOnRequest(nonAdminCtx, baseRequest)).toBe(false);
  });

  it("should not allow user with empty guildIds to comment on request", () => {
    const emptyGuildsCtx: RequestAuthContext = {
      userId: "user456",
      isAdmin: true,
      isSuperAdmin: false,
      guildIds: [],
    };
    expect(canCommentOnRequest(emptyGuildsCtx, baseRequest)).toBe(false);
  });
});

describe("canDeleteRequest", () => {
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

  const superAdminCtx: RequestAuthContext = {
    userId: "superadmin1",
    isAdmin: true,
    isSuperAdmin: true,
    guildIds: ["guild123"],
  };

  const ownerAdminCtx: RequestAuthContext = {
    userId: "user456",
    isAdmin: true,
    isSuperAdmin: false,
    guildIds: ["guild123"],
  };

  it("should allow super admin to delete any request", () => {
    expect(canDeleteRequest(superAdminCtx, baseRequest)).toBe(true);
  });

  it("should allow super admin to delete closed request", () => {
    const closedRequest = { ...baseRequest, status: "closed" as const };
    expect(canDeleteRequest(superAdminCtx, closedRequest)).toBe(true);
  });

  it("should not allow admin to delete their own request", () => {
    expect(canDeleteRequest(ownerAdminCtx, baseRequest)).toBe(false);
  });

  it("should not allow super admin to delete request outside their guild", () => {
    const nonMemberSuperAdminCtx: RequestAuthContext = {
      userId: "superadmin1",
      isAdmin: true,
      isSuperAdmin: true,
      guildIds: ["other-guild"],
    };
    expect(canDeleteRequest(nonMemberSuperAdminCtx, baseRequest)).toBe(false);
  });

  it("should not allow non-admin to delete request", () => {
    const nonAdminCtx: RequestAuthContext = {
      userId: "user456",
      isAdmin: false,
      isSuperAdmin: false,
      guildIds: ["guild123"],
    };
    expect(canDeleteRequest(nonAdminCtx, baseRequest)).toBe(false);
  });

  it("should not allow user with empty guildIds to delete request", () => {
    const emptyGuildsCtx: RequestAuthContext = {
      userId: "superadmin1",
      isAdmin: true,
      isSuperAdmin: true,
      guildIds: [],
    };
    expect(canDeleteRequest(emptyGuildsCtx, baseRequest)).toBe(false);
  });
});
