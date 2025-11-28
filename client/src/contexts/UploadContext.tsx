import React, { createContext, useContext, useState } from "react";

interface UploadContextType {
  showUploadMonitor: boolean;
  uploadMonitorEverShown: boolean;
  hasActiveUploads: boolean;
  setShowUploadMonitor: (show: boolean) => void;
  updateUploadMonitorVisibility: (show: boolean) => void;
  setHasActiveUploads: (hasActive: boolean) => void;
}

const UploadContext = createContext<UploadContextType | undefined>(undefined);

export const UploadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [showUploadMonitor, setShowUploadMonitor] = useState(false);
  const [uploadMonitorEverShown, setUploadMonitorEverShown] = useState(false);
  const [hasActiveUploads, setHasActiveUploads] = useState(false);

  const updateUploadMonitorVisibility = (show: boolean) => {
    setShowUploadMonitor(show);
    if (show) {
      setUploadMonitorEverShown(true);
    }
  };

  return (
    <UploadContext.Provider
      value={{
        showUploadMonitor,
        uploadMonitorEverShown,
        hasActiveUploads,
        setShowUploadMonitor,
        updateUploadMonitorVisibility,
        setHasActiveUploads,
      }}
    >
      {children}
    </UploadContext.Provider>
  );
};

export const useUploadContext = () => {
  const context = useContext(UploadContext);
  if (context === undefined) {
    throw new Error("useUploadContext must be used within an UploadProvider");
  }
  return context;
};
