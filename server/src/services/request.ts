import { randomUUID } from "crypto";
import type { Request, RequestComment, RequestStatus } from "utils";
import { appLogger } from "../middleware/logger.ts";
import redis from "../redis.ts";

const REQUEST_PREFIX = "request:";
const REQUEST_COMMENTS_PREFIX = "request:comments:";
const REQUEST_COMMENT_PREFIX = "request:comment:";
const REQUEST_GUILD_PREFIX = "request:guild:";
const REQUEST_USER_PREFIX = "request:user:";
const REQUEST_STATUS_PREFIX = "request:status:";
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
    // Set TTL on index keys to prevent orphaned references
    multi.expire(guildKey, REQUEST_TTL_SECONDS);
    multi.expire(userKey, REQUEST_TTL_SECONDS);
    multi.expire(statusKey, REQUEST_TTL_SECONDS);
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
      // Update TTL on status index keys
      multi.expire(newStatusKey, REQUEST_TTL_SECONDS);

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
}
