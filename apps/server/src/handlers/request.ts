import type { Request, Response } from "express";
import {
  addCommentSchema,
  createRequestSchema,
  listRequestsFilterSchema,
  updateRequestStatusSchema,
} from "utils";
import { ZodError } from "zod";
import { appLogger } from "../middleware/logger.ts";
import {
  AuthorizationError,
  canCancelRequest,
  canChangeRequestStatus,
  canCommentOnRequest,
  canCreateRequest,
  canDeleteRequest,
  canListRequests,
  canViewRequest,
  RequestService,
  type RequestAuthContext,
} from "../services/request.ts";

const requestService = new RequestService();

/**
 * Build authorization context from Express session data.
 * Returns a context with safe defaults if session properties are missing.
 */
const buildAuthContext = (req: Request): RequestAuthContext => {
  const session = req.session;
  return {
    userId: typeof session?.userId === "string" ? session.userId : "",
    isAdmin: session?.isAdmin === true,
    isSuperAdmin: session?.isSuperAdmin === true,
    guildIds: Array.isArray(session?.guildIds) ? session.guildIds : [],
  };
};

/**
 * POST /api/guilds/:guildId/requests
 * Create a new request in the specified guild.
 * Only admins can create requests.
 */
export const createRequest = async (req: Request, res: Response) => {
  try {
    const guildId = req.params.guildId;
    if (!guildId) {
      return res.status(400).json({ error: "Missing guildId parameter" });
    }

    const body = createRequestSchema.parse({ ...req.body, guildId });
    const authCtx = buildAuthContext(req);

    // Authorization check
    if (!canCreateRequest(authCtx, guildId)) {
      throw new AuthorizationError(
        "You do not have permission to create requests in this guild",
        "create",
        guildId,
      );
    }

    const request = await requestService.createRequest(
      guildId,
      authCtx.userId,
      body.title,
      body.description,
      body.galleryId,
    );

    appLogger.debug(
      { requestId: request.id, guildId, userId: authCtx.userId },
      "[createRequest] Request created",
    );
    res.status(201).json(request);
  } catch (err: unknown) {
    if (err instanceof AuthorizationError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    if (err instanceof ZodError) {
      return res.status(400).json({ error: err.issues.map((e) => e.message).join(", ") });
    }
    appLogger.error({ err }, "[createRequest] error");
    res.status(500).json({ error: "Failed to create request" });
  }
};

/**
 * GET /api/guilds/:guildId/requests
 * List requests with filtering and cursor-based pagination.
 * - Admins see only their own requests (requestor=me enforced)
 * - Super admins can see all requests in the guild
 *
 * Query params:
 * - status: Filter by status (open, approved, denied, cancelled, closed)
 * - cursor: Cursor for pagination (request ID from previous page)
 * - limit: Number of results per page (default 20, max 100)
 * - sortDirection: Sort direction (asc or desc, default desc)
 */
export const listMyRequests = async (req: Request, res: Response) => {
  try {
    const guildId = req.params.guildId;
    if (!guildId) {
      return res.status(400).json({ error: "Missing guildId parameter" });
    }

    const authCtx = buildAuthContext(req);

    // Authorization check
    if (!canListRequests(authCtx)) {
      throw new AuthorizationError("You do not have permission to list requests", "list", guildId);
    }

    // Check if user is a member of the guild
    if (!authCtx.guildIds.includes(guildId)) {
      throw new AuthorizationError("You are not a member of this guild", "list", guildId);
    }

    // Parse and validate filter/pagination params
    const filterInput = {
      status: req.query.status,
      cursor: req.query.cursor,
      limit: req.query.limit ?? 20,
      sortDirection: req.query.sortDirection ?? "desc",
    };
    const filter = listRequestsFilterSchema.parse(filterInput);

    // Admins (non-super-admins) can only see their own requests
    const userId = authCtx.isSuperAdmin ? undefined : authCtx.userId;

    // Fetch paginated and filtered requests
    const result = await requestService.listRequestsFiltered([guildId], userId, filter);

    appLogger.debug(
      {
        guildId,
        userId: authCtx.userId,
        isSuperAdmin: authCtx.isSuperAdmin,
        filter,
        count: result.data.length,
        total: result.pagination.total,
      },
      "[listMyRequests] Listed requests with pagination",
    );
    res.json(result);
  } catch (err: unknown) {
    if (err instanceof AuthorizationError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    if (err instanceof ZodError) {
      return res.status(400).json({ error: err.issues.map((e) => e.message).join(", ") });
    }
    appLogger.error({ err }, "[listMyRequests] error");
    res.status(500).json({ error: "Failed to list requests" });
  }
};

/**
 * POST /api/requests/:requestId/cancel
 * Cancel an open request.
 * Admins can only cancel their own open requests.
 */
export const cancelRequest = async (req: Request, res: Response) => {
  try {
    const requestId = req.params.requestId;
    if (!requestId) {
      return res.status(400).json({ error: "Missing requestId parameter" });
    }

    const authCtx = buildAuthContext(req);

    // Fetch the request
    const request = await requestService.getRequest(requestId);
    if (!request) {
      return res.status(404).json({ error: "Request not found" });
    }

    // Authorization check
    if (!canCancelRequest(authCtx, request)) {
      throw new AuthorizationError(
        "You do not have permission to cancel this request",
        "cancel",
        requestId,
      );
    }

    // Update the status to cancelled
    const updatedRequest = await requestService.updateRequestStatus(requestId, "cancelled");

    appLogger.debug({ requestId, userId: authCtx.userId }, "[cancelRequest] Request cancelled");
    res.json(updatedRequest);
  } catch (err: unknown) {
    if (err instanceof AuthorizationError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    if (err instanceof Error && err.message.includes("Invalid status transition")) {
      return res.status(400).json({ error: err.message });
    }
    appLogger.error({ err }, "[cancelRequest] error");
    res.status(500).json({ error: "Failed to cancel request" });
  }
};

/**
 * POST /api/requests/:requestId/comments
 * Add a comment to a request.
 * Admins can only comment on their own open requests.
 */
export const addComment = async (req: Request, res: Response) => {
  try {
    const requestId = req.params.requestId;
    if (!requestId) {
      return res.status(400).json({ error: "Missing requestId parameter" });
    }

    const body = addCommentSchema.parse({ ...req.body, requestId });
    const authCtx = buildAuthContext(req);

    // Fetch the request
    const request = await requestService.getRequest(requestId);
    if (!request) {
      return res.status(404).json({ error: "Request not found" });
    }

    // Authorization check
    if (!canCommentOnRequest(authCtx, request)) {
      throw new AuthorizationError(
        "You do not have permission to comment on this request",
        "comment",
        requestId,
      );
    }

    // Add the comment
    const comment = await requestService.addComment(requestId, authCtx.userId, body.content);

    appLogger.debug(
      { commentId: comment.id, requestId, userId: authCtx.userId },
      "[addComment] Comment added",
    );
    res.status(201).json(comment);
  } catch (err: unknown) {
    if (err instanceof AuthorizationError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    if (err instanceof ZodError) {
      return res.status(400).json({ error: err.issues.map((e) => e.message).join(", ") });
    }
    if (err instanceof Error && err.message.includes("does not exist")) {
      return res.status(404).json({ error: err.message });
    }
    appLogger.error({ err }, "[addComment] error");
    res.status(500).json({ error: "Failed to add comment" });
  }
};

/**
 * GET /api/requests/:requestId/comments
 * Get all comments for a request, sorted chronologically.
 * Admins can view comments on their own requests.
 * Super admins can view comments on any request in their guilds.
 */
export const getComments = async (req: Request, res: Response) => {
  try {
    const requestId = req.params.requestId;
    if (!requestId) {
      return res.status(400).json({ error: "Missing requestId parameter" });
    }

    const authCtx = buildAuthContext(req);

    // Fetch the request
    const request = await requestService.getRequest(requestId);
    if (!request) {
      return res.status(404).json({ error: "Request not found" });
    }

    // Authorization check - reuse canViewRequest which checks guild membership and ownership
    if (!canViewRequest(authCtx, request)) {
      throw new AuthorizationError(
        "You do not have permission to view comments on this request",
        "viewComments",
        requestId,
      );
    }

    // Fetch comments
    const comments = await requestService.getComments(requestId);

    appLogger.debug(
      { requestId, userId: authCtx.userId, commentCount: comments.length },
      "[getComments] Comments retrieved",
    );
    res.json(comments);
  } catch (err: unknown) {
    if (err instanceof AuthorizationError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    appLogger.error({ err }, "[getComments] error");
    res.status(500).json({ error: "Failed to get comments" });
  }
};

/**
 * GET /api/admin/guilds/:guildId/requests (super admin only)
 * List all requests in a guild with filtering and cursor-based pagination.
 * Only super admins can access this endpoint.
 *
 * Query params:
 * - status: Filter by status (open, approved, denied, cancelled, closed)
 * - cursor: Cursor for pagination (request ID from previous page)
 * - limit: Number of results per page (default 20, max 100)
 * - sortDirection: Sort direction (asc or desc, default desc)
 */
export const listGuildRequests = async (req: Request, res: Response) => {
  try {
    const guildId = req.params.guildId;
    if (!guildId) {
      return res.status(400).json({ error: "Missing guildId parameter" });
    }

    const authCtx = buildAuthContext(req);

    // Check if user is a member of the guild
    if (!authCtx.guildIds.includes(guildId)) {
      throw new AuthorizationError("You are not a member of this guild", "list", guildId);
    }

    // Parse and validate filter/pagination params
    const filterInput = {
      status: req.query.status,
      cursor: req.query.cursor,
      limit: req.query.limit ?? 20,
      sortDirection: req.query.sortDirection ?? "desc",
    };
    const filter = listRequestsFilterSchema.parse(filterInput);

    // Super admins see all requests in the guild (no user filter)
    const result = await requestService.listRequestsFiltered([guildId], undefined, filter);

    appLogger.debug(
      {
        guildId,
        userId: authCtx.userId,
        filter,
        count: result.data.length,
        total: result.pagination.total,
      },
      "[listGuildRequests] Listed guild requests with pagination",
    );
    res.json(result);
  } catch (err: unknown) {
    if (err instanceof AuthorizationError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    if (err instanceof ZodError) {
      return res.status(400).json({ error: err.issues.map((e) => e.message).join(", ") });
    }
    appLogger.error({ err }, "[listGuildRequests] error");
    res.status(500).json({ error: "Failed to list requests" });
  }
};

/**
 * GET /api/admin/requests/:requestId (super admin only)
 * Get a single request by ID.
 * Only super admins can access this endpoint.
 */
export const getRequestById = async (req: Request, res: Response) => {
  try {
    const requestId = req.params.requestId;
    if (!requestId) {
      return res.status(400).json({ error: "Missing requestId parameter" });
    }

    const authCtx = buildAuthContext(req);

    // Fetch the request
    const request = await requestService.getRequest(requestId);
    if (!request) {
      return res.status(404).json({ error: "Request not found" });
    }

    // Authorization check
    if (!canViewRequest(authCtx, request)) {
      throw new AuthorizationError(
        "You do not have permission to view this request",
        "view",
        requestId,
      );
    }

    // Fetch comments for the request
    const comments = await requestService.getComments(requestId);

    appLogger.debug({ requestId, userId: authCtx.userId }, "[getRequestById] Request retrieved");
    res.json({ ...request, comments });
  } catch (err: unknown) {
    if (err instanceof AuthorizationError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    appLogger.error({ err }, "[getRequestById] error");
    res.status(500).json({ error: "Failed to get request" });
  }
};

/**
 * POST /api/admin/requests/:requestId/status (super admin only)
 * Change the status of a request.
 * Valid transitions: open -> approved/denied/cancelled, approved/denied/cancelled -> closed, closed -> open
 */
export const changeRequestStatus = async (req: Request, res: Response) => {
  try {
    const requestId = req.params.requestId;
    if (!requestId) {
      return res.status(400).json({ error: "Missing requestId parameter" });
    }

    const body = updateRequestStatusSchema.parse({ ...req.body, requestId });
    const authCtx = buildAuthContext(req);

    // Fetch the request
    const request = await requestService.getRequest(requestId);
    if (!request) {
      return res.status(404).json({ error: "Request not found" });
    }

    // Authorization check
    if (!canChangeRequestStatus(authCtx, request, body.status)) {
      throw new AuthorizationError(
        "You do not have permission to change the status of this request",
        "changeStatus",
        requestId,
      );
    }

    // Update the status
    const closedBy = body.status === "closed" ? authCtx.userId : undefined;
    const updatedRequest = await requestService.updateRequestStatus(
      requestId,
      body.status,
      closedBy,
    );

    appLogger.debug(
      { requestId, userId: authCtx.userId, newStatus: body.status },
      "[changeRequestStatus] Request status changed",
    );
    res.json(updatedRequest);
  } catch (err: unknown) {
    if (err instanceof AuthorizationError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    if (err instanceof ZodError) {
      return res.status(400).json({ error: err.issues.map((e) => e.message).join(", ") });
    }
    if (err instanceof Error && err.message.includes("Invalid status transition")) {
      return res.status(400).json({ error: err.message });
    }
    appLogger.error({ err }, "[changeRequestStatus] error");
    res.status(500).json({ error: "Failed to change request status" });
  }
};

/**
 * DELETE /api/admin/requests/:requestId (super admin only)
 * Delete a request.
 * Only super admins can delete requests.
 */
export const deleteRequest = async (req: Request, res: Response) => {
  try {
    const requestId = req.params.requestId;
    if (!requestId) {
      return res.status(400).json({ error: "Missing requestId parameter" });
    }

    const authCtx = buildAuthContext(req);

    // Fetch the request
    const request = await requestService.getRequest(requestId);
    if (!request) {
      return res.status(404).json({ error: "Request not found" });
    }

    // Authorization check
    if (!canDeleteRequest(authCtx, request)) {
      throw new AuthorizationError(
        "You do not have permission to delete this request",
        "delete",
        requestId,
      );
    }

    // Delete the request
    await requestService.deleteRequest(requestId);

    appLogger.debug({ requestId, userId: authCtx.userId }, "[deleteRequest] Request deleted");
    res.status(204).send();
  } catch (err: unknown) {
    if (err instanceof AuthorizationError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    appLogger.error({ err }, "[deleteRequest] error");
    res.status(500).json({ error: "Failed to delete request" });
  }
};
