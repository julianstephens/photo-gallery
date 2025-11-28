import type { NextFunction, Request, Response } from "express";
import { ChunkedUploadService } from "../services/chunkedUpload.ts";
import { appLogger } from "./logger.ts";

const chunkedUploadService = new ChunkedUploadService();

const coerceString = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const coerced = coerceString(entry);
      if (coerced) return coerced;
    }
  }
  return undefined;
};

const extractGuildIdFromBody = (req: Request): string | undefined => {
  if (req.body && typeof req.body === "object") {
    const bodyGuildId = (req.body as Record<string, unknown>).guildId;
    return coerceString(bodyGuildId);
  }
  return undefined;
};

const extractGuildIdFromHeaders = (req: Request): string | undefined => {
  const headerValue = req.header("x-guild-id") ?? req.header("guild-id");
  return coerceString(headerValue ?? undefined);
};

const extractUploadId = (req: Request): string | undefined => {
  const queryUploadId = coerceString((req.query as Record<string, unknown>)?.uploadId);
  if (queryUploadId) return queryUploadId;

  if (req.body && typeof req.body === "object") {
    const bodyUploadId = (req.body as Record<string, unknown>).uploadId;
    const coercedBodyId = coerceString(bodyUploadId);
    if (coercedBodyId) return coercedBodyId;
  }

  const paramUploadId = coerceString(req.params?.uploadId);
  if (paramUploadId) return paramUploadId;

  return undefined;
};

const resolveGuildId = (req: Request) => {
  const queryGuildId = coerceString((req.query as Record<string, unknown>)?.guildId);
  if (queryGuildId) {
    return { guildId: queryGuildId, source: "query" as const };
  }

  const bodyGuildId = extractGuildIdFromBody(req);
  if (bodyGuildId) {
    return { guildId: bodyGuildId, source: "body" as const };
  }

  const paramGuildId = coerceString(req.params?.guildId);
  if (paramGuildId) {
    return { guildId: paramGuildId, source: "params" as const };
  }

  const headerGuildId = extractGuildIdFromHeaders(req);
  if (headerGuildId) {
    return { guildId: headerGuildId, source: "header" as const };
  }

  const uploadId = extractUploadId(req);
  if (uploadId) {
    const metadataGuildId = chunkedUploadService.getMetadata(uploadId)?.guildId;
    if (metadataGuildId) {
      return { guildId: metadataGuildId, source: "upload-metadata" as const, uploadId };
    }
    return { guildId: undefined, source: "upload-metadata" as const, uploadId };
  }

  return { guildId: undefined, source: "unknown" as const };
};

export const requiresAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
};

export const requiresAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.session.isAdmin) {
    return res.status(403).json({ error: "Forbidden: Admins only" });
  }
  next();
};

/**
 * Middleware to validate guild membership for the given guildId.
 * Checks that the user's session contains guild memberships and that the
 * requested guildId is in their list of authenticated guilds.
 *
 * Requires the `requiresAuth` middleware to be applied before this middleware.
 * Assumes that `req.session.userId` is present and valid.
 */
export const requiresGuildMembership = (req: Request, res: Response, next: NextFunction) => {
  const { guildId, source, uploadId } = resolveGuildId(req);

  // Validate guildId is present in any supported location
  if (!guildId) {
    appLogger.warn(
      { userId: req.session.userId, path: req.path, uploadId, source },
      "[requiresGuildMembership] Missing guildId parameter",
    );
    return res.status(400).json({ error: "Missing guildId parameter" });
  }

  // Check for authenticated guild memberships in session
  const guildIds = req.session.guildIds;
  if (!guildIds || guildIds.length === 0) {
    appLogger.warn(
      { userId: req.session.userId, path: req.path },
      "[requiresGuildMembership] Missing guild membership context",
    );
    return res.status(403).json({ error: "Forbidden: Missing guild membership context" });
  }

  // Cross-check guildId against verified memberships
  if (!guildIds.includes(guildId)) {
    appLogger.warn(
      { userId: req.session.userId, requestedGuildId: guildId, path: req.path },
      "[requiresGuildMembership] User not a member of requested guild",
    );
    return res.status(403).json({ error: "Forbidden: Not a member of the requested guild" });
  }

  next();
};
