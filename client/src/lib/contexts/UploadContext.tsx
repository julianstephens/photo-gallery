import { createContext, useContext, useState, type ReactNode } from "react";

interface UploadContextType {
  showUploadMonitor: boolean;
  uploadMonitorEverShown: boolean;
  setShowUploadMonitor: (show: boolean) => void;
}

const UploadContext = createContext<UploadContextType | undefined>(undefined);

export const UploadProvider = ({ children }: { children: ReactNode }) => {
  const [showUploadMonitor, setShowUploadMonitorState] = useState(false);
  const [uploadMonitorEverShown, setUploadMonitorEverShown] = useState(false);

  const setShowUploadMonitor = (show: boolean) => {
    setShowUploadMonitorState(show);
    if (show) {
      setUploadMonitorEverShown(true);
    }
  };

  return (
    <UploadContext.Provider
      value={{
        showUploadMonitor,
        uploadMonitorEverShown,
        setShowUploadMonitor,
      }}
    >
      {children}
    </UploadContext.Provider>
  );
};

export const useUploadContext = () => {
  const context = useContext(UploadContext);
  if (!context) {
    throw new Error("useUploadContext must be used within an UploadProvider");
  }
  return context;
};
