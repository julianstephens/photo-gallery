import type { Request, Response } from "express";
import { addCommentSchema, createRequestSchema } from "utils";
import { ZodError } from "zod";
import { appLogger } from "../middleware/logger.ts";
import {
  AuthorizationError,
  canCancelRequest,
  canCommentOnRequest,
  canCreateRequest,
  canViewRequest,
  RequestService,
  type RequestAuthContext,
} from "../services/request.ts";

const requestService = new RequestService();

/**
 * Build authorization context from Express session data.
 */
const buildAuthContext = (req: Request): RequestAuthContext => ({
  userId: req.session.userId || "",
  isAdmin: req.session.isAdmin || false,
  isSuperAdmin: req.session.isSuperAdmin || false,
  guildIds: req.session.guildIds || [],
});

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
 * GET /api/guilds/:guildId/requests?requestor=me
 * List requests for the authenticated user in the specified guild.
 * Admins can only see their own requests.
 */
export const listMyRequests = async (req: Request, res: Response) => {
  try {
    const guildId = req.params.guildId;
    if (!guildId) {
      return res.status(400).json({ error: "Missing guildId parameter" });
    }

    const authCtx = buildAuthContext(req);

    // Check if requestor=me query param is present
    const requestor = String(req.query.requestor || "");
    if (requestor !== "me") {
      return res.status(400).json({ error: "Only requestor=me is supported for admin users" });
    }

    // Check if user is a member of the guild
    if (!authCtx.guildIds.includes(guildId)) {
      throw new AuthorizationError("You are not a member of this guild", "list", guildId);
    }

    // Fetch all requests for the user
    const allUserRequests = await requestService.getRequestsByUser(authCtx.userId);

    // Filter to only requests in this guild that the user owns
    const filteredRequests = allUserRequests.filter(
      (request) => request.guildId === guildId && canViewRequest(authCtx, request),
    );

    appLogger.debug(
      { guildId, userId: authCtx.userId, count: filteredRequests.length },
      "[listMyRequests] Listed user requests",
    );
    res.json(filteredRequests);
  } catch (err: unknown) {
    if (err instanceof AuthorizationError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
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
