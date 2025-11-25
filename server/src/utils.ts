import { randomBytes } from "node:crypto";

export class InvalidInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidInputError";
  }
}

const toBase64Url = (u8: Uint8Array): string => {
  const b64 = Buffer.from(u8).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

export const generateSessionId = (byteLength: number = 32): string => {
  if (!Number.isInteger(byteLength) || byteLength < 16) {
    throw new Error("byteLength must be an integer >= 16");
  }
  const bytes = randomBytes(byteLength);
  return toBase64Url(bytes);
};

export const validateString = (value: string, errorMessage?: string) => {
  if (!value || value.trim() === "") {
    throw new InvalidInputError(errorMessage ?? "Input string cannot be empty");
  }
  return value.trim();
};

export const normalizeGalleryFolderName = (value: string) => {
  const trimmed = validateString(value, "Gallery name cannot be empty").toLowerCase();
  const slug = trimmed
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return slug || "gallery";
};
