import { createContext } from "react";

export interface UploadContextValue {
  showUploadMonitor: boolean;
  uploadMonitorEverShown: boolean;
  setShowUploadMonitor: (show: boolean) => void;
}

export const UploadContext = createContext<UploadContextValue | undefined>(undefined);
