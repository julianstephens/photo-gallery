import { z } from "zod";

/**
 * Status values for a request.
 */
export const requestStatusSchema = z.enum(["open", "approved", "denied", "cancelled", "closed"]);

/**
 * Request object schema.
 */
export const requestSchema = z.object({
  id: z.string().uuid(),
  guildId: z.string().min(1),
  userId: z.string().min(1),
  galleryId: z.string().min(1).optional(),
  title: z.string().min(1).max(255),
  description: z.string().min(1).max(4000),
  status: requestStatusSchema,
  createdAt: z.number(),
  updatedAt: z.number(),
  closedAt: z.number().optional(),
  closedBy: z.string().optional(),
});

/**
 * Request comment schema.
 */
export const requestCommentSchema = z.object({
  id: z.string().uuid(),
  requestId: z.string().uuid(),
  userId: z.string().min(1),
  content: z.string().min(1).max(2000),
  createdAt: z.number(),
});

/**
 * Schema for creating a new request.
 */
export const createRequestSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().min(1).max(4000),
  guildId: z.string().min(1),
  galleryId: z.string().min(1).optional(),
});

/**
 * Schema for adding a comment to a request.
 */
export const addCommentSchema = z.object({
  requestId: z.string().uuid(),
  content: z.string().min(1).max(2000),
});

/**
 * Schema for updating a request's status.
 */
export const updateRequestStatusSchema = z.object({
  requestId: z.string().uuid(),
  status: requestStatusSchema,
});

/**
 * Sort direction (ascending or descending).
 */
export const sortDirectionSchema = z.enum(["asc", "desc"]);

/**
 * Schema for filtering and paginating requests (cursor-based pagination).
 * Cursor is the ID of the last request from the previous page.
 */
export const listRequestsFilterSchema = z.object({
  /** Filter by status (optional) */
  status: requestStatusSchema.optional(),
  /** Cursor for pagination - ID of the last request from the previous page */
  cursor: z.string().uuid().optional(),
  /** Number of results per page (default 20, max 100) */
  limit: z.coerce.number().int().min(1).max(100).default(20),
  /** Sort direction (default: desc - newest first, based on createdAt) */
  sortDirection: sortDirectionSchema.default("desc"),
});

/**
 * Schema for paginated response metadata.
 */
export const paginationMetaSchema = z.object({
  /** Total count of items matching the filter */
  total: z.number().int().min(0),
  /** Number of items in the current page */
  count: z.number().int().min(0),
  /** Cursor for fetching the next page (null if no more pages) */
  nextCursor: z.string().uuid().nullable(),
  /** Whether there are more results after this page */
  hasMore: z.boolean(),
});

/**
 * Schema for paginated request list response.
 */
export const paginatedRequestsResponseSchema = z.object({
  data: z.array(requestSchema),
  pagination: paginationMetaSchema,
});
