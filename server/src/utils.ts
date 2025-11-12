import { randomBytes } from "node:crypto";

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
