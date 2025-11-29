import z from "zod";
import type {
  addCommentSchema,
  createRequestSchema,
  requestCommentSchema,
  requestSchema,
  requestStatusSchema,
  updateRequestStatusSchema,
} from "../schemas/request.ts";

export type RequestStatus = z.infer<typeof requestStatusSchema>;

export type Request = z.infer<typeof requestSchema>;

export type RequestComment = z.infer<typeof requestCommentSchema>;

export type CreateRequestInput = z.infer<typeof createRequestSchema>;

export type AddCommentInput = z.infer<typeof addCommentSchema>;

export type UpdateRequestStatusInput = z.infer<typeof updateRequestStatusSchema>;
