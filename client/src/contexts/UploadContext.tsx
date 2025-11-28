import { useCallback, useMemo, useState, type ReactNode } from "react";
import { UploadContext, type UploadContextValue } from "./uploadContextStore";

export const UploadProvider = ({ children }: { children: ReactNode }) => {
  const [showUploadMonitor, setShowUploadMonitor] = useState(false);
  const [uploadMonitorEverShown, setUploadMonitorEverShown] = useState(false);
  const [hasActiveUploads, setHasActiveUploads] = useState(false);

  const updateUploadMonitorVisibility = useCallback((show: boolean) => {
    setShowUploadMonitor(show);
    if (show) {
      setUploadMonitorEverShown(true);
    }
  }, []);

  const value: UploadContextValue = useMemo(
    () => ({
      showUploadMonitor,
      uploadMonitorEverShown,
      hasActiveUploads,
      setShowUploadMonitor,
      updateUploadMonitorVisibility,
      setHasActiveUploads,
    }),
    [showUploadMonitor, uploadMonitorEverShown, hasActiveUploads, updateUploadMonitorVisibility],
  );

  return <UploadContext.Provider value={value}>{children}</UploadContext.Provider>;
};
