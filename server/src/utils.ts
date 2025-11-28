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

const trimSlashes = (segment: string) => segment.replace(/^\/+|\/+$/g, "");

const sanitizePathSegment = (value: string, label: string) => {
  const trimmed = validateString(value, `${label} is required`);
  const cleaned = trimSlashes(trimmed.replace(/[^a-zA-Z0-9-_]+/g, "-"));
  return cleaned || "default";
};

export type GalleryStorageRef = {
  guildId: string;
  gallerySlug: string;
};

type GalleryStoragePathInput = GalleryStorageRef & {
  relativePath?: string;
};

export const buildGalleryStoragePrefix = ({ guildId, gallerySlug }: GalleryStorageRef) => {
  const sanitizedGuild = sanitizePathSegment(guildId, "Guild ID");
  const slug = normalizeGalleryFolderName(gallerySlug);
  return `guilds/${sanitizedGuild}/galleries/${slug}`;
};

export const buildGalleryStoragePath = ({
  guildId,
  gallerySlug,
  relativePath,
}: GalleryStoragePathInput) => {
  const base = buildGalleryStoragePrefix({ guildId, gallerySlug });
  if (!relativePath) {
    return base;
  }
  const cleanedRelative = trimSlashes(relativePath);
  return cleanedRelative.length > 0 ? `${base}/${cleanedRelative}` : base;
};

/**
 * Escapes HTML entities to prevent XSS attacks.
 * Covers the most common characters that could be used in XSS payloads.
 */
export const escapeHtml = (str: string): string => {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};
