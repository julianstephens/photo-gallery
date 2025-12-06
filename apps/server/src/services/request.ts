import { randomUUID } from "crypto";
import type {
  ListRequestsFilter,
  PaginatedRequestsResponse,
  Request,
  RequestComment,
  RequestStatus,
} from "utils";
import { appLogger } from "../middleware/logger.ts";
import redis from "../redis.ts";

const REQUEST_PREFIX = "request:";
const REQUEST_COMMENTS_PREFIX = "request:comments:";
const REQUEST_COMMENT_PREFIX = "request:comment:";
const REQUEST_GUILD_PREFIX = "request:guild:";
const REQUEST_USER_PREFIX = "request:user:";
const REQUEST_STATUS_PREFIX = "request:status:";
const REQUEST_CREATED_ZSET = "request:created";
const REQUEST_UPDATED_ZSET = "request:updated";
const REQUEST_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

/**
 * Valid status transitions for requests.
 * - open -> approved, denied, cancelled
 * - approved/denied/cancelled -> closed
 * - closed -> open (super admin re-open)
 */
const VALID_STATUS_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  open: ["approved", "denied", "cancelled"],
  approved: ["closed"],
  denied: ["closed"],
  cancelled: ["closed"],
  closed: ["open"],
};

/**
 * Check if a status transition is valid.
 */
export const isValidStatusTransition = (current: RequestStatus, next: RequestStatus): boolean => {
  const allowedTransitions = VALID_STATUS_TRANSITIONS[current];
  return allowedTransitions?.includes(next) ?? false;
};

/**
 * Check if a user can modify a request.
 * - Owner can modify their own open requests
 * - Super admin can modify any request
 */
export const canUserModifyRequest = (
  userId: string,
  request: Request,
  isSuperAdmin: boolean,
): boolean => {
  if (isSuperAdmin) {
    return true;
  }
  return request.userId === userId && request.status === "open";
};

/**
 * Authorization context for request operations.
 * Contains user identity and permission flags needed for authorization checks.
 */
export interface RequestAuthContext {
  /** The ID of the user making the request */
  userId: string;
  /** Whether the user has admin privileges */
  isAdmin: boolean;
  /** Whether the user has super admin privileges */
  isSuperAdmin: boolean;
  /** Array of guild IDs the user is a member of */
  guildIds: string[];
}

/**
 * Error thrown when a user is not authorized to perform an action.
 * Provides consistent error structure for API consumption.
 */
export class AuthorizationError extends Error {
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
}

/**
 * Check if a user can view a specific request.
 * Rules:
 * - Super admins can view any request in guilds they have access to
 * - Admins can only view their own requests within their guild
 */
export const canViewRequest = (ctx: RequestAuthContext, request: Request): boolean => {
  // User must be a member of the request's guild
  if (!ctx.guildIds.includes(request.guildId)) {
    return false;
  }

  // Super admins can view any request in their guilds
  if (ctx.isSuperAdmin) {
    return true;
  }

  // Admins can only view their own requests
  if (ctx.isAdmin) {
    return request.userId === ctx.userId;
  }

  return false;
};

/**
 * Check if a user can list requests.
 * Rules:
 * - Super admins can list all requests (filtered to their guilds)
 * - Admins can list their own requests only
 */
export const canListRequests = (ctx: RequestAuthContext): boolean => {
  // Must be at least an admin to list requests
  return ctx.isAdmin || ctx.isSuperAdmin;
};

/**
 * Check if a user can create a request.
 * Rules:
 * - Only admins and super admins can create requests
 * - Must be a member of the guild where the request is being created
 */
export const canCreateRequest = (ctx: RequestAuthContext, guildId: string): boolean => {
  // Must be at least an admin
  if (!ctx.isAdmin && !ctx.isSuperAdmin) {
    return false;
  }

  // Must be a member of the target guild
  return ctx.guildIds.includes(guildId);
};

/**
 * Check if a user can cancel a request.
 * Rules:
 * - Super admins can cancel any open request in their guilds
 * - Admins can only cancel their own open requests
 */
export const canCancelRequest = (ctx: RequestAuthContext, request: Request): boolean => {
  // User must be a member of the request's guild
  if (!ctx.guildIds.includes(request.guildId)) {
    return false;
  }

  // Request must be open to be cancelled
  if (request.status !== "open") {
    return false;
  }

  // Super admins can cancel any open request
  if (ctx.isSuperAdmin) {
    return true;
  }

  // Admins can only cancel their own open requests
  if (ctx.isAdmin) {
    return request.userId === ctx.userId;
  }

  return false;
};

/**
 * Check if a user can change a request's status.
 * Rules:
 * - Only super admins can approve, deny requests
 * - Only super admins can re-open closed requests
 * - Admins can only cancel their own open requests
 * - Super admins can cancel any open request
 */
export const canChangeRequestStatus = (
  ctx: RequestAuthContext,
  request: Request,
  newStatus: RequestStatus,
): boolean => {
  // User must be a member of the request's guild
  if (!ctx.guildIds.includes(request.guildId)) {
    return false;
  }

  // Check if the status transition is valid
  if (!isValidStatusTransition(request.status, newStatus)) {
    return false;
  }

  // Super admins can make any valid status change
  if (ctx.isSuperAdmin) {
    return true;
  }

  // Admins can only cancel their own open requests
  if (ctx.isAdmin) {
    // Admins (non-super-admins) can only cancel their own open requests
    if (newStatus === "cancelled" && request.status === "open" && request.userId === ctx.userId) {
      return true;
    }
  }

  return false;
};

/**
 * Check if a user can comment on a request.
 * Rules:
 * - Super admins can comment on any request regardless of status
 * - Admins can only comment on their own open requests
 */
export const canCommentOnRequest = (ctx: RequestAuthContext, request: Request): boolean => {
  // User must be a member of the request's guild
  if (!ctx.guildIds.includes(request.guildId)) {
    return false;
  }

  // Super admins can comment on any request regardless of status
  if (ctx.isSuperAdmin) {
    return true;
  }

  // Admins can only comment on their own open requests
  if (ctx.isAdmin) {
    return request.userId === ctx.userId && request.status === "open";
  }

  return false;
};

/**
 * Check if a user can delete a request.
 * Rules:
 * - Only super admins can delete requests
 */
export const canDeleteRequest = (ctx: RequestAuthContext, request: Request): boolean => {
  // User must be a member of the request's guild
  if (!ctx.guildIds.includes(request.guildId)) {
    return false;
  }

  // Only super admins can delete requests
  return ctx.isSuperAdmin;
};

/**
 * Service for managing requests in Redis.
 */
export class RequestService {
  #buildRequestKey = (requestId: string) => `${REQUEST_PREFIX}${requestId}`;
  #buildCommentsKey = (requestId: string) => `${REQUEST_COMMENTS_PREFIX}${requestId}`;
  #buildCommentKey = (commentId: string) => `${REQUEST_COMMENT_PREFIX}${commentId}`;
  #buildGuildKey = (guildId: string) => `${REQUEST_GUILD_PREFIX}${guildId}`;
  #buildUserKey = (userId: string) => `${REQUEST_USER_PREFIX}${userId}`;
  #buildStatusKey = (status: RequestStatus) => `${REQUEST_STATUS_PREFIX}${status}`;

  /**
   * Create a new request with atomic index updates.
   */
  createRequest = async (
    guildId: string,
    userId: string,
    title: string,
    description: string,
    galleryId?: string,
  ): Promise<Request> => {
    const id = randomUUID();
    const now = Date.now();

    const request: Request = {
      id,
      guildId,
      userId,
      galleryId,
      title,
      description,
      status: "open",
      createdAt: now,
      updatedAt: now,
    };

    const requestKey = this.#buildRequestKey(id);
    const guildKey = this.#buildGuildKey(guildId);
    const userKey = this.#buildUserKey(userId);
    const statusKey = this.#buildStatusKey("open");

    // Use MULTI/EXEC for atomic operations
    const multi = redis.client.multi();
    multi.set(requestKey, JSON.stringify(request));
    multi.expire(requestKey, REQUEST_TTL_SECONDS);
    multi.sAdd(guildKey, id);
    multi.sAdd(userKey, id);
    multi.sAdd(statusKey, id);
    // Add to sorted sets for pagination (score = timestamp)
    multi.zAdd(REQUEST_CREATED_ZSET, { score: now, value: id });
    multi.zAdd(REQUEST_UPDATED_ZSET, { score: now, value: id });
    // No TTL on index keys; orphaned references are filtered during reads in #getRequestsBatch
    await multi.exec();

    appLogger.debug(
      { requestId: id, guildId, userId, title, galleryId },
      "[request] created request",
    );

    return request;
  };

  /**
   * Get a single request by ID.
   */
  getRequest = async (requestId: string): Promise<Request | null> => {
    const requestKey = this.#buildRequestKey(requestId);
    const data = await redis.client.get(requestKey);

    if (!data) {
      appLogger.warn({ requestId }, "[request] getRequest cache miss");
      return null;
    }

    try {
      return JSON.parse(data) as Request;
    } catch (error) {
      appLogger.error({ requestId, err: error }, "[request] failed to parse request JSON");
      return null;
    }
  };

  /**
   * Batch fetch multiple requests using MGET for performance.
   */
  #getRequestsBatch = async (requestIds: string[]): Promise<Request[]> => {
    if (requestIds.length === 0) return [];

    const keys = requestIds.map((id) => this.#buildRequestKey(id));
    const results = await redis.client.mGet(keys);

    const requests: Request[] = [];
    for (let i = 0; i < results.length; i++) {
      const data = results[i];
      if (data) {
        try {
          requests.push(JSON.parse(data) as Request);
        } catch (error) {
          appLogger.error(
            { requestId: requestIds[i], err: error },
            "[request] failed to parse request JSON in batch",
          );
        }
      }
    }

    return requests;
  };

  /**
   * Get all requests for a guild.
   */
  getRequestsByGuild = async (guildId: string): Promise<Request[]> => {
    const guildKey = this.#buildGuildKey(guildId);
    const requestIds = await redis.client.sMembers(guildKey);

    const requests = await this.#getRequestsBatch(requestIds);

    appLogger.debug({ guildId, requestCount: requests.length }, "[request] fetched guild requests");

    return requests;
  };

  /**
   * Get all requests by a user.
   */
  getRequestsByUser = async (userId: string): Promise<Request[]> => {
    const userKey = this.#buildUserKey(userId);
    const requestIds = await redis.client.sMembers(userKey);

    const requests = await this.#getRequestsBatch(requestIds);

    appLogger.debug({ userId, requestCount: requests.length }, "[request] fetched user requests");

    return requests;
  };

  /**
   * Get all requests by a user in a specific guild.
   * Uses Redis SINTER to efficiently find the intersection of user and guild request sets.
   */
  getRequestsByUserAndGuild = async (userId: string, guildId: string): Promise<Request[]> => {
    const userKey = this.#buildUserKey(userId);
    const guildKey = this.#buildGuildKey(guildId);

    // Use SINTER to get intersection of user and guild request sets
    const requestIds = await redis.client.sInter([userKey, guildKey]);

    const requests = await this.#getRequestsBatch(requestIds);

    appLogger.debug(
      { userId, guildId, requestCount: requests.length },
      "[request] fetched user requests by guild",
    );

    return requests;
  };

  /**
   * Get all requests by status.
   */
  getRequestsByStatus = async (status: RequestStatus): Promise<Request[]> => {
    const statusKey = this.#buildStatusKey(status);
    const requestIds = await redis.client.sMembers(statusKey);

    const requests = await this.#getRequestsBatch(requestIds);

    appLogger.debug(
      { status, requestCount: requests.length },
      "[request] fetched requests by status",
    );

    return requests;
  };

  /**
   * Update request status with atomic index movement.
   * Uses WATCH/MULTI/EXEC for optimistic locking to prevent race conditions.
   */
  updateRequestStatus = async (
    requestId: string,
    newStatus: RequestStatus,
    closedBy?: string,
  ): Promise<Request> => {
    const requestKey = this.#buildRequestKey(requestId);
    const MAX_RETRIES = 5;
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
      attempt++;

      // Watch the key for changes
      await redis.client.watch(requestKey);

      const data = await redis.client.get(requestKey);

      if (!data) {
        await redis.client.unwatch();
        throw new Error(`Request ${requestId} does not exist`);
      }

      let request: Request;
      try {
        request = JSON.parse(data) as Request;
      } catch (err) {
        await redis.client.unwatch();
        throw new Error(`Corrupted request data for ${requestId}: ${(err as Error).message}`);
      }

      const previousStatus = request.status;

      if (!isValidStatusTransition(previousStatus, newStatus)) {
        await redis.client.unwatch();
        throw new Error(`Invalid status transition from ${previousStatus} to ${newStatus}`);
      }

      const now = Date.now();
      request.status = newStatus;
      request.updatedAt = now;

      if (newStatus === "closed") {
        request.closedAt = now;
        if (closedBy) {
          request.closedBy = closedBy;
        }
      } else if (newStatus === "open" && previousStatus === "closed") {
        // Re-opening a closed request
        request.closedAt = undefined;
        request.closedBy = undefined;
      }

      const previousStatusKey = this.#buildStatusKey(previousStatus);
      const newStatusKey = this.#buildStatusKey(newStatus);

      // Use MULTI/EXEC for atomic operations
      const multi = redis.client.multi();
      multi.set(requestKey, JSON.stringify(request));
      multi.expire(requestKey, REQUEST_TTL_SECONDS);
      multi.sRem(previousStatusKey, requestId);
      multi.sAdd(newStatusKey, requestId);
      // Update the updatedAt sorted set for pagination
      multi.zAdd(REQUEST_UPDATED_ZSET, { score: now, value: requestId });
      // No TTL on index keys; orphaned references are filtered during reads

      const results = await multi.exec();

      // If transaction failed due to concurrent modification, retry
      if (results === null) {
        appLogger.debug(
          { requestId, attempt, maxRetries: MAX_RETRIES },
          "[request] status update failed due to concurrent modification, retrying",
        );
        continue;
      }

      appLogger.debug(
        { requestId, previousStatus, newStatus, closedBy },
        "[request] updated request status",
      );

      return request;
    }

    throw new Error(`Failed to update request ${requestId} status due to concurrent modifications`);
  };

  /**
   * Add a comment to a request.
   */
  addComment = async (
    requestId: string,
    userId: string,
    content: string,
  ): Promise<RequestComment> => {
    // Verify request exists
    const request = await this.getRequest(requestId);
    if (!request) {
      throw new Error(`Request ${requestId} does not exist`);
    }

    const commentId = randomUUID();
    const now = Date.now();

    const comment: RequestComment = {
      id: commentId,
      requestId,
      userId,
      content,
      createdAt: now,
    };

    const commentKey = this.#buildCommentKey(commentId);
    const commentsKey = this.#buildCommentsKey(requestId);

    // Use MULTI/EXEC for atomic operations
    const multi = redis.client.multi();
    multi.set(commentKey, JSON.stringify(comment));
    multi.expire(commentKey, REQUEST_TTL_SECONDS);
    multi.zAdd(commentsKey, { score: now, value: commentId });
    multi.expire(commentsKey, REQUEST_TTL_SECONDS);
    await multi.exec();

    appLogger.debug({ commentId, requestId, userId }, "[request] added comment");

    return comment;
  };

  /**
   * Get all comments for a request (sorted by timestamp in ascending/chronological order).
   * Uses zRange for efficient retrieval and MGET for batch fetching.
   */
  getComments = async (requestId: string): Promise<RequestComment[]> => {
    const commentsKey = this.#buildCommentsKey(requestId);
    // Use zRange which returns elements in ascending order by score (oldest first)
    const commentIds = await redis.client.zRange(commentsKey, 0, -1);

    if (commentIds.length === 0) return [];

    // Batch fetch all comments using MGET
    const keys = commentIds.map((id) => this.#buildCommentKey(id));
    const results = await redis.client.mGet(keys);

    const comments: RequestComment[] = [];
    for (let i = 0; i < results.length; i++) {
      const data = results[i];
      if (data) {
        try {
          comments.push(JSON.parse(data) as RequestComment);
        } catch (error) {
          appLogger.error(
            { commentId: commentIds[i], err: error },
            "[request] failed to parse comment JSON",
          );
        }
      }
    }

    appLogger.debug({ requestId, commentCount: comments.length }, "[request] fetched comments");

    return comments;
  };

  /**
   * Delete a request and clean up all indexes.
   */
  deleteRequest = async (requestId: string): Promise<void> => {
    const request = await this.getRequest(requestId);

    if (!request) {
      appLogger.warn({ requestId }, "[request] deleteRequest: request not found");
      return;
    }

    const requestKey = this.#buildRequestKey(requestId);
    const commentsKey = this.#buildCommentsKey(requestId);
    const guildKey = this.#buildGuildKey(request.guildId);
    const userKey = this.#buildUserKey(request.userId);
    const statusKey = this.#buildStatusKey(request.status);

    // Get all comment IDs before deleting using zRange (more efficient than zRangeByScore)
    const commentIds = await redis.client.zRange(commentsKey, 0, -1);

    // Use MULTI/EXEC for atomic operations
    const multi = redis.client.multi();
    multi.del(requestKey);
    multi.del(commentsKey);
    multi.sRem(guildKey, requestId);
    multi.sRem(userKey, requestId);
    multi.sRem(statusKey, requestId);
    // Remove from pagination sorted sets
    multi.zRem(REQUEST_CREATED_ZSET, requestId);
    multi.zRem(REQUEST_UPDATED_ZSET, requestId);

    // Delete all comment entries
    for (const commentId of commentIds) {
      multi.del(this.#buildCommentKey(commentId));
    }

    await multi.exec();

    appLogger.debug(
      {
        requestId,
        guildId: request.guildId,
        userId: request.userId,
        commentCount: commentIds.length,
      },
      "[request] deleted request and associated data",
    );
  };

  /**
   * List requests with filtering and cursor-based pagination.
   * Uses set intersection for efficient filtering and sorted sets for ordering.
   *
   * @param guildIds - Guild IDs to filter by (user must be a member)
   * @param userId - Optional user ID to filter by (for "my requests")
   * @param filter - Pagination and filtering options
   * @returns Paginated response with requests and pagination metadata
   */
  listRequestsFiltered = async (
    guildIds: string[],
    userId: string | undefined,
    filter: ListRequestsFilter,
  ): Promise<PaginatedRequestsResponse> => {
    const { status, cursor, limit, sortDirection } = filter;

    // Build the set keys for intersection
    const setKeys: string[] = [];

    // Always filter by guild membership - union of all guild sets
    // For multiple guilds, we need to get union first, then intersect with other filters
    if (guildIds.length === 0) {
      return {
        data: [],
        pagination: { total: 0, count: 0, nextCursor: null, hasMore: false },
      };
    }

    // If filtering by user, add user set
    if (userId) {
      setKeys.push(this.#buildUserKey(userId));
    }

    // If filtering by status, add status set
    if (status) {
      setKeys.push(this.#buildStatusKey(status));
    }

    // Get candidate request IDs
    let candidateIds: string[];

    if (guildIds.length === 1) {
      // Single guild - simple case
      const guildKey = this.#buildGuildKey(guildIds[0]);
      if (setKeys.length === 0) {
        // No additional filters, just get guild requests
        candidateIds = await redis.client.sMembers(guildKey);
      } else {
        // Intersect guild with other filters
        candidateIds = await redis.client.sInter([guildKey, ...setKeys]);
      }
    } else {
      // Multiple guilds - need to union guild sets first
      const guildKeys = guildIds.map((guildId) => this.#buildGuildKey(guildId));
      const guildUnion = await redis.client.sUnion(guildKeys);

      if (setKeys.length === 0) {
        candidateIds = guildUnion;
      } else {
        // Store temporary union result, then intersect
        // Use a temporary key for the union
        const tempUnionKey = `request:temp:union:${randomUUID()}`;
        if (guildUnion.length > 0) {
          await redis.client.sAdd(tempUnionKey, guildUnion);
          await redis.client.expire(tempUnionKey, 60); // Short TTL
          candidateIds = await redis.client.sInter([tempUnionKey, ...setKeys]);
          await redis.client.del(tempUnionKey);
        } else {
          candidateIds = [];
        }
      }
    }

    if (candidateIds.length === 0) {
      return {
        data: [],
        pagination: { total: 0, count: 0, nextCursor: null, hasMore: false },
      };
    }

    // Get scores (createdAt timestamps) for all candidates from the sorted set
    // Using ZMSCORE for efficient batch retrieval (single Redis round trip)
    const scores = await redis.client.zMScore(REQUEST_CREATED_ZSET, candidateIds);

    // Build array of {id, score} and filter out null scores (orphaned entries)
    const candidatesWithScores: Array<{ id: string; score: number }> = [];
    for (let i = 0; i < candidateIds.length; i++) {
      const score = scores[i];
      if (score !== null) {
        candidatesWithScores.push({ id: candidateIds[i], score });
      }
    }

    const total = candidatesWithScores.length;

    if (total === 0) {
      return {
        data: [],
        pagination: { total: 0, count: 0, nextCursor: null, hasMore: false },
      };
    }

    // Sort by createdAt (score)
    candidatesWithScores.sort((a, b) =>
      sortDirection === "desc" ? b.score - a.score : a.score - b.score,
    );

    // Apply cursor-based pagination
    let startIndex = 0;
    if (cursor) {
      const cursorIndex = candidatesWithScores.findIndex((c) => c.id === cursor);
      if (cursorIndex !== -1) {
        startIndex = cursorIndex + 1; // Start after the cursor
      }
    }

    // Get the page of IDs
    const pageIds = candidatesWithScores.slice(startIndex, startIndex + limit).map((c) => c.id);
    const hasMore = startIndex + limit < total;
    const nextCursor = hasMore ? pageIds[pageIds.length - 1] : null;

    // Batch fetch the actual request objects
    const requests = await this.#getRequestsBatch(pageIds);

    // Sort the fetched requests to maintain the same order as pageIds
    const requestMap = new Map(requests.map((r) => [r.id, r]));
    const sortedRequests = pageIds
      .map((id) => requestMap.get(id))
      .filter((r): r is Request => r !== undefined);

    appLogger.debug(
      {
        guildIds,
        userId,
        status,
        cursor,
        limit,
        sortDirection,
        total,
        count: sortedRequests.length,
        hasMore,
      },
      "[request] listRequestsFiltered completed",
    );

    return {
      data: sortedRequests,
      pagination: {
        total,
        count: sortedRequests.length,
        nextCursor,
        hasMore,
      },
    };
  };
}
