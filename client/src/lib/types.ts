import type { UploadJob, User } from "utils";

export interface AuthStateShape {
  isAuthed: boolean;
  authReady: boolean;
  loading: boolean;
  error: Error | null;
}

export interface AuthContextValue extends AuthStateShape {
  currentUser: User | null;
  login: () => void | Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export interface UploadJobWorkerState {
  job: UploadJob | null;
  status: "idle" | "running" | "completed" | "failed" | "timeout" | "not_found";
  error: string | null;
}
