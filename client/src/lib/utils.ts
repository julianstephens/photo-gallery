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
