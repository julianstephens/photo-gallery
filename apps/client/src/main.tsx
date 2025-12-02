import { queryClient } from "@/clients";
import { Provider } from "@/components/ui/provider.tsx";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, GalleryProvider, UploadProvider } from "@/contexts";
import { AppRoutes } from "@/routes.tsx";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <Provider>
          <UploadProvider>
            <AuthProvider>
              <GalleryProvider>
                <AppRoutes />
                <Toaster />
              </GalleryProvider>
            </AuthProvider>
          </UploadProvider>
        </Provider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
);
