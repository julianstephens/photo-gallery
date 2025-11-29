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
