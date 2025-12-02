import { createContext } from "react";

export interface UploadContextValue {
  showUploadMonitor: boolean;
  uploadMonitorEverShown: boolean;
  hasActiveUploads: boolean;
  setShowUploadMonitor: (show: boolean) => void;
  updateUploadMonitorVisibility: (show: boolean) => void;
  setHasActiveUploads: (hasActive: boolean) => void;
}

export const UploadContext = createContext<UploadContextValue | undefined>(undefined);
