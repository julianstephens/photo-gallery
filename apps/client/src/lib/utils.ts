import type { AxiosError } from "axios";
import { createContext } from "react";
import type { AuthContextValue } from "./types";

export type Nullish<T> = T | null | undefined;

export const toErrorMessage = (err: unknown): string => {
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const anyErr = err as AxiosError<{ error?: string }>;
    if (anyErr.response?.data?.error) return String(anyErr.response.data.error);
    if (anyErr.message) return String(anyErr.message);
    return JSON.stringify(anyErr);
  }
  return "An unexpected error occurred";
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Safely get a nested property from an object using a dot-separated string.
 * @param obj The object to get the property from.
 * @param prop The dot-separated string representing the property path.
 * @returns The value at the specified property path, or undefined if not found.
 */
export const get = (obj: unknown, prop: string) => {
  const parsedFields = prop
    .split(".")
    .map((part) => part.trim())
    .filter((part) => part);

  for (const field of parsedFields) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, field)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      obj = (obj as any)[field];
    } else {
      return undefined;
    }
  }
  return obj;
};

/**
 * Default threshold in days for "expiring soon" warnings.
 * Galleries expiring within this many days will show a warning indicator.
 */
export const DEFAULT_EXPIRY_WARNING_THRESHOLD_DAYS = 7;

/**
 * Calculates the number of days until a given expiration timestamp.
 * Returns a negative number if the expiration date has passed.
 * @param expiresAt Expiration timestamp in milliseconds
 * @param now Optional current time in milliseconds (defaults to Date.now())
 * @returns Number of days until expiration (can be negative if expired)
 */
export const getDaysUntilExpiry = (expiresAt: number, now: number = Date.now()): number => {
  const diffMs = expiresAt - now;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
};

/**
 * Result of checking gallery expiration status.
 */
export interface ExpirationStatus {
  /** Whether the gallery has expired */
  isExpired: boolean;
  /** Whether the gallery is expiring soon (within threshold) */
  isExpiringSoon: boolean;
  /** Number of days until expiration (negative if expired) */
  daysUntilExpiry: number;
  /** Human-readable expiration message */
  message: string;
}

/**
 * Gets the expiration status for a gallery.
 * @param expiresAt Expiration timestamp in milliseconds
 * @param thresholdDays Number of days within which to show a warning (default: 7)
 * @param now Optional current time in milliseconds (defaults to Date.now())
 * @returns ExpirationStatus object with expiration details
 */
export const getExpirationStatus = (
  expiresAt: number,
  thresholdDays: number = DEFAULT_EXPIRY_WARNING_THRESHOLD_DAYS,
  now: number = Date.now(),
): ExpirationStatus => {
  const daysUntilExpiry = getDaysUntilExpiry(expiresAt, now);
  const isExpired = daysUntilExpiry <= 0;
  const isExpiringSoon = !isExpired && daysUntilExpiry <= thresholdDays;

  let message: string;
  if (isExpired) {
    message = "Expired";
  } else if (daysUntilExpiry === 1) {
    message = "Expires tomorrow";
  } else {
    message = `Expires in ${daysUntilExpiry} days`;
  }

  return {
    isExpired,
    isExpiringSoon,
    daysUntilExpiry,
    message,
  };
};
