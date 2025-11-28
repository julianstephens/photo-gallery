import { useMemo, useState, type ReactNode } from "react";
import { UploadContext, type UploadContextValue } from "./uploadContextStore";

export const UploadProvider = ({ children }: { children: ReactNode }) => {
  const [showUploadMonitor, setShowUploadMonitorState] = useState(false);
  const [uploadMonitorEverShown, setUploadMonitorEverShown] = useState(false);

  const setShowUploadMonitor = (show: boolean) => {
    setShowUploadMonitorState(show);
    if (show) {
      setUploadMonitorEverShown(true);
    }
  };

  const value = useMemo<UploadContextValue>(
    () => ({
      showUploadMonitor,
      uploadMonitorEverShown,
      setShowUploadMonitor,
    }),
    [showUploadMonitor, uploadMonitorEverShown],
  );

  return <UploadContext.Provider value={value}>{children}</UploadContext.Provider>;
};
