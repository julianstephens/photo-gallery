import { describe, expect, it } from "vitest";
import {
  addCommentSchema,
  createRequestSchema,
  requestCommentSchema,
  requestSchema,
  requestStatusSchema,
  updateRequestStatusSchema,
} from "../src/schemas/request.ts";

describe("requestStatusSchema", () => {
  it("should accept valid status values", () => {
    expect(requestStatusSchema.parse("open")).toBe("open");
    expect(requestStatusSchema.parse("approved")).toBe("approved");
    expect(requestStatusSchema.parse("denied")).toBe("denied");
    expect(requestStatusSchema.parse("cancelled")).toBe("cancelled");
    expect(requestStatusSchema.parse("closed")).toBe("closed");
  });

  it("should reject invalid status values", () => {
    expect(() => requestStatusSchema.parse("invalid")).toThrow();
    expect(() => requestStatusSchema.parse("pending")).toThrow();
    expect(() => requestStatusSchema.parse("")).toThrow();
  });
});

describe("addCommentSchema", () => {
  it("should accept valid comment data", () => {
    const result = addCommentSchema.parse({
      requestId: "550e8400-e29b-41d4-a716-446655440000",
      content: "This is a valid comment",
    });
    expect(result.requestId).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(result.content).toBe("This is a valid comment");
  });

  it("should reject empty content", () => {
    expect(() =>
      addCommentSchema.parse({
        requestId: "550e8400-e29b-41d4-a716-446655440000",
        content: "",
      }),
    ).toThrow();
  });

  it("should reject content exceeding max length (2000 chars)", () => {
    const oversizeContent = "x".repeat(2001);
    expect(() =>
      addCommentSchema.parse({
        requestId: "550e8400-e29b-41d4-a716-446655440000",
        content: oversizeContent,
      }),
    ).toThrow();
  });

  it("should accept content at max length (2000 chars)", () => {
    const maxContent = "x".repeat(2000);
    const result = addCommentSchema.parse({
      requestId: "550e8400-e29b-41d4-a716-446655440000",
      content: maxContent,
    });
    expect(result.content.length).toBe(2000);
  });

  it("should reject invalid requestId format", () => {
    expect(() =>
      addCommentSchema.parse({
        requestId: "invalid-uuid",
        content: "Valid comment",
      }),
    ).toThrow();
  });

  it("should reject missing content", () => {
    expect(() =>
      addCommentSchema.parse({
        requestId: "550e8400-e29b-41d4-a716-446655440000",
      }),
    ).toThrow();
  });

  it("should reject missing requestId", () => {
    expect(() =>
      addCommentSchema.parse({
        content: "Valid comment",
      }),
    ).toThrow();
  });
});

describe("requestCommentSchema", () => {
  it("should accept valid comment object", () => {
    const result = requestCommentSchema.parse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      requestId: "550e8400-e29b-41d4-a716-446655440001",
      userId: "user123",
      content: "Test comment",
      createdAt: Date.now(),
    });
    expect(result.content).toBe("Test comment");
    expect(result.userId).toBe("user123");
  });

  it("should reject content exceeding max length", () => {
    expect(() =>
      requestCommentSchema.parse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        requestId: "550e8400-e29b-41d4-a716-446655440001",
        userId: "user123",
        content: "x".repeat(2001),
        createdAt: Date.now(),
      }),
    ).toThrow();
  });

  it("should reject empty userId", () => {
    expect(() =>
      requestCommentSchema.parse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        requestId: "550e8400-e29b-41d4-a716-446655440001",
        userId: "",
        content: "Test comment",
        createdAt: Date.now(),
      }),
    ).toThrow();
  });
});

describe("createRequestSchema", () => {
  it("should accept valid request data", () => {
    const result = createRequestSchema.parse({
      title: "Test Request",
      description: "This is a test request description",
      guildId: "guild123",
    });
    expect(result.title).toBe("Test Request");
    expect(result.description).toBe("This is a test request description");
    expect(result.guildId).toBe("guild123");
  });

  it("should accept optional galleryId", () => {
    const result = createRequestSchema.parse({
      title: "Test Request",
      description: "This is a test request description",
      guildId: "guild123",
      galleryId: "gallery456",
    });
    expect(result.galleryId).toBe("gallery456");
  });

  it("should reject title exceeding max length (255 chars)", () => {
    expect(() =>
      createRequestSchema.parse({
        title: "x".repeat(256),
        description: "Valid description",
        guildId: "guild123",
      }),
    ).toThrow();
  });

  it("should reject description exceeding max length (4000 chars)", () => {
    expect(() =>
      createRequestSchema.parse({
        title: "Valid title",
        description: "x".repeat(4001),
        guildId: "guild123",
      }),
    ).toThrow();
  });

  it("should reject empty title", () => {
    expect(() =>
      createRequestSchema.parse({
        title: "",
        description: "Valid description",
        guildId: "guild123",
      }),
    ).toThrow();
  });

  it("should reject empty description", () => {
    expect(() =>
      createRequestSchema.parse({
        title: "Valid title",
        description: "",
        guildId: "guild123",
      }),
    ).toThrow();
  });

  it("should reject empty guildId", () => {
    expect(() =>
      createRequestSchema.parse({
        title: "Valid title",
        description: "Valid description",
        guildId: "",
      }),
    ).toThrow();
  });
});

describe("updateRequestStatusSchema", () => {
  it("should accept valid status update", () => {
    const result = updateRequestStatusSchema.parse({
      requestId: "550e8400-e29b-41d4-a716-446655440000",
      status: "approved",
    });
    expect(result.status).toBe("approved");
    expect(result.requestId).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("should reject invalid status value", () => {
    expect(() =>
      updateRequestStatusSchema.parse({
        requestId: "550e8400-e29b-41d4-a716-446655440000",
        status: "invalid",
      }),
    ).toThrow();
  });

  it("should reject invalid requestId format", () => {
    expect(() =>
      updateRequestStatusSchema.parse({
        requestId: "not-a-uuid",
        status: "approved",
      }),
    ).toThrow();
  });
});

describe("requestSchema", () => {
  const validRequest = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    guildId: "guild123",
    userId: "user456",
    title: "Test Request",
    description: "Test description",
    status: "open" as const,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  it("should accept valid request object", () => {
    const result = requestSchema.parse(validRequest);
    expect(result.id).toBe(validRequest.id);
    expect(result.status).toBe("open");
  });

  it("should accept optional galleryId", () => {
    const result = requestSchema.parse({
      ...validRequest,
      galleryId: "gallery789",
    });
    expect(result.galleryId).toBe("gallery789");
  });

  it("should accept optional closedAt and closedBy", () => {
    const result = requestSchema.parse({
      ...validRequest,
      status: "closed",
      closedAt: Date.now(),
      closedBy: "admin123",
    });
    expect(result.closedAt).toBeDefined();
    expect(result.closedBy).toBe("admin123");
  });

  it("should reject invalid id format", () => {
    expect(() =>
      requestSchema.parse({
        ...validRequest,
        id: "not-a-uuid",
      }),
    ).toThrow();
  });

  it("should reject title exceeding max length", () => {
    expect(() =>
      requestSchema.parse({
        ...validRequest,
        title: "x".repeat(256),
      }),
    ).toThrow();
  });

  it("should reject description exceeding max length", () => {
    expect(() =>
      requestSchema.parse({
        ...validRequest,
        description: "x".repeat(4001),
      }),
    ).toThrow();
  });
});
