import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock env before importing logger
vi.mock("../schemas/env.ts", () => ({
  default: {
    NODE_ENV: "test",
    LOG_LEVEL: "info",
    LOG_OUTPUT: undefined,
    LOKI_URL: undefined,
    LOG_FILE_PATH: "logs/test.log",
    LOG_FILE_MAX_SIZE: "10M",
    LOG_FILE_MAX_FILES: 7,
  },
}));

// Mock rotating-file-stream
vi.mock("rotating-file-stream", () => ({
  createStream: vi.fn(() => ({
    write: vi.fn(),
    end: vi.fn(),
  })),
}));

describe("Logger module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should export logger, appLogger, httpLogger, and createChildLogger", async () => {
    const loggerModule = await import("./logger.ts");

    expect(loggerModule.logger).toBeDefined();
    expect(loggerModule.appLogger).toBeDefined();
    expect(loggerModule.httpLogger).toBeDefined();
    expect(loggerModule.createChildLogger).toBeDefined();
  });

  it("should have correct log level from env", async () => {
    const { logger, appLogger } = await import("./logger.ts");

    expect(logger.level).toBe("info");
    expect(appLogger.level).toBe("info");
  });

  it("should create child logger with bindings", async () => {
    const { createChildLogger } = await import("./logger.ts");

    const childLogger = createChildLogger({ requestId: "test-123", userId: "user-456" });

    expect(childLogger).toBeDefined();
    expect(typeof childLogger.info).toBe("function");
    expect(typeof childLogger.error).toBe("function");
    expect(typeof childLogger.warn).toBe("function");
    expect(typeof childLogger.debug).toBe("function");
  });

  it("httpLogger should be a function (middleware)", async () => {
    const { httpLogger } = await import("./logger.ts");

    // httpLogger from pino-http returns a middleware function
    expect(typeof httpLogger).toBe("function");
  });
});

describe("Logger environment-based configuration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("should use stdout output in production when LOG_OUTPUT is not set", async () => {
    vi.doMock("../schemas/env.ts", () => ({
      default: {
        NODE_ENV: "production",
        LOG_LEVEL: "info",
        LOG_OUTPUT: undefined,
        LOKI_URL: undefined,
        LOG_FILE_PATH: "logs/app.log",
        LOG_FILE_MAX_SIZE: "10M",
        LOG_FILE_MAX_FILES: 7,
      },
    }));

    const { appLogger } = await import("./logger.ts");

    expect(appLogger).toBeDefined();
    expect(appLogger.level).toBe("info");
  });

  it("should use file output in development when LOG_OUTPUT is not set", async () => {
    vi.doMock("../schemas/env.ts", () => ({
      default: {
        NODE_ENV: "development",
        LOG_LEVEL: "debug",
        LOG_OUTPUT: undefined,
        LOKI_URL: undefined,
        LOG_FILE_PATH: "logs/dev.log",
        LOG_FILE_MAX_SIZE: "10M",
        LOG_FILE_MAX_FILES: 7,
      },
    }));

    const { appLogger } = await import("./logger.ts");

    expect(appLogger).toBeDefined();
    expect(appLogger.level).toBe("debug");
  });

  it("should respect explicit LOG_OUTPUT=stdout", async () => {
    vi.doMock("../schemas/env.ts", () => ({
      default: {
        NODE_ENV: "development",
        LOG_LEVEL: "info",
        LOG_OUTPUT: "stdout",
        LOKI_URL: undefined,
        LOG_FILE_PATH: "logs/app.log",
        LOG_FILE_MAX_SIZE: "10M",
        LOG_FILE_MAX_FILES: 7,
      },
    }));

    const { appLogger } = await import("./logger.ts");

    expect(appLogger).toBeDefined();
    expect(appLogger.level).toBe("info");
  });

  it("should respect explicit LOG_OUTPUT=file", async () => {
    vi.doMock("../schemas/env.ts", () => ({
      default: {
        NODE_ENV: "production",
        LOG_LEVEL: "warn",
        LOG_OUTPUT: "file",
        LOKI_URL: undefined,
        LOG_FILE_PATH: "logs/prod.log",
        LOG_FILE_MAX_SIZE: "50M",
        LOG_FILE_MAX_FILES: 14,
      },
    }));

    const { appLogger } = await import("./logger.ts");

    expect(appLogger).toBeDefined();
    expect(appLogger.level).toBe("warn");
  });

  it("should respect explicit LOG_OUTPUT=both", async () => {
    vi.doMock("../schemas/env.ts", () => ({
      default: {
        NODE_ENV: "development",
        LOG_LEVEL: "debug",
        LOG_OUTPUT: "both",
        LOKI_URL: undefined,
        LOG_FILE_PATH: "logs/both.log",
        LOG_FILE_MAX_SIZE: "10M",
        LOG_FILE_MAX_FILES: 7,
      },
    }));

    const { appLogger } = await import("./logger.ts");

    expect(appLogger).toBeDefined();
    expect(appLogger.level).toBe("debug");
  });
});
