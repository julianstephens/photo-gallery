import { Route, Routes } from "react-router";
import { AdminLayout } from "./components/AdminLayout";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import AdminGalleryManagerPage from "./pages/admin/AdminGalleryManager";
import AdminRequestsPage from "./pages/admin/AdminRequests";
import AdminSettingsPage from "./pages/admin/AdminSettings";
import Dashboard from "./pages/Dashboard";
import LandingPage from "./pages/Landing";
import NotFoundPage from "./pages/NotFound";

export const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<LandingPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="home" element={<Dashboard />} />
        </Route>
        <Route element={<ProtectedRoute requiresAdmin={true} />}>
          <Route path="admin" element={<AdminLayout />}>
            <Route index element={<AdminGalleryManagerPage />} />
            <Route path="requests" element={<AdminRequestsPage />} />
            <Route path="settings" element={<AdminSettingsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
};
