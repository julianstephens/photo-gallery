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
