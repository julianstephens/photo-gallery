import z from "zod";
import type {
  addCommentSchema,
  createRequestSchema,
  listRequestsFilterSchema,
  paginatedRequestsResponseSchema,
  paginationMetaSchema,
  requestCommentSchema,
  requestSchema,
  requestStatusSchema,
  sortDirectionSchema,
  updateRequestStatusSchema,
} from "../schemas/request.ts";

export type RequestStatus = z.infer<typeof requestStatusSchema>;

export type Request = z.infer<typeof requestSchema>;

export type RequestComment = z.infer<typeof requestCommentSchema>;

export type CreateRequestInput = z.infer<typeof createRequestSchema>;

export type AddCommentInput = z.infer<typeof addCommentSchema>;

export type UpdateRequestStatusInput = z.infer<typeof updateRequestStatusSchema>;

export type SortDirection = z.infer<typeof sortDirectionSchema>;

export type ListRequestsFilter = z.infer<typeof listRequestsFilterSchema>;

export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

export type PaginatedRequestsResponse = z.infer<typeof paginatedRequestsResponseSchema>;
