import { describe, it, expect } from "vitest";
import { parseEnvFile, envVarsToCoolifyFormat } from "./reconciler.js";

describe("parseEnvFile", () => {
  it("should parse simple key=value pairs", () => {
    const content = `
KEY1=value1
KEY2=value2
`;
    const result = parseEnvFile(content);
    expect(result).toEqual({
      KEY1: "value1",
      KEY2: "value2",
    });
  });

  it("should handle double-quoted values", () => {
    const content = `KEY="quoted value"`;
    const result = parseEnvFile(content);
    expect(result).toEqual({
      KEY: "quoted value",
    });
  });

  it("should handle single-quoted values", () => {
    const content = `KEY='single quoted'`;
    const result = parseEnvFile(content);
    expect(result).toEqual({
      KEY: "single quoted",
    });
  });

  it("should skip empty lines", () => {
    const content = `
KEY1=value1

KEY2=value2
`;
    const result = parseEnvFile(content);
    expect(result).toEqual({
      KEY1: "value1",
      KEY2: "value2",
    });
  });

  it("should skip comment lines", () => {
    const content = `
# This is a comment
KEY1=value1
# Another comment
KEY2=value2
`;
    const result = parseEnvFile(content);
    expect(result).toEqual({
      KEY1: "value1",
      KEY2: "value2",
    });
  });

  it("should handle values with equals signs", () => {
    const content = `DATABASE_URL=postgres://user:pass@host:5432/db?query=value`;
    const result = parseEnvFile(content);
    expect(result).toEqual({
      DATABASE_URL: "postgres://user:pass@host:5432/db?query=value",
    });
  });

  it("should handle empty values", () => {
    const content = `EMPTY_KEY=`;
    const result = parseEnvFile(content);
    expect(result).toEqual({
      EMPTY_KEY: "",
    });
  });

  it("should handle keys with underscores and numbers", () => {
    const content = `
MY_KEY_123=value1
_PRIVATE=value2
`;
    const result = parseEnvFile(content);
    expect(result).toEqual({
      MY_KEY_123: "value1",
      _PRIVATE: "value2",
    });
  });

  it("should handle Windows line endings", () => {
    const content = "KEY1=value1\r\nKEY2=value2\r\n";
    const result = parseEnvFile(content);
    expect(result).toEqual({
      KEY1: "value1",
      KEY2: "value2",
    });
  });

  it("should handle empty content", () => {
    const result = parseEnvFile("");
    expect(result).toEqual({});
  });

  it("should skip lines with invalid format", () => {
    const content = `
KEY1=value1
invalid line without equals
KEY2=value2
`;
    const result = parseEnvFile(content);
    expect(result).toEqual({
      KEY1: "value1",
      KEY2: "value2",
    });
  });
});

describe("envVarsToCoolifyFormat", () => {
  it("should convert env vars to Coolify format", () => {
    const envVars = {
      KEY1: "value1",
      KEY2: "value2",
    };

    const result = envVarsToCoolifyFormat(envVars);

    expect(result).toHaveLength(2);
    expect(result).toContainEqual({
      key: "KEY1",
      value: "value1",
      is_preview: false,
      is_literal: true,
      is_multiline: false,
      is_shown_once: false,
    });
    expect(result).toContainEqual({
      key: "KEY2",
      value: "value2",
      is_preview: false,
      is_literal: true,
      is_multiline: false,
      is_shown_once: false,
    });
  });

  it("should mark multiline values", () => {
    const envVars = {
      MULTILINE: "line1\nline2\nline3",
    };

    const result = envVarsToCoolifyFormat(envVars);

    expect(result[0].is_multiline).toBe(true);
  });

  it("should handle empty env vars", () => {
    const result = envVarsToCoolifyFormat({});
    expect(result).toEqual([]);
  });
});
