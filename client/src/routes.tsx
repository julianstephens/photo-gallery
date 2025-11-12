import { Route, Routes } from "react-router";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import AdminDashboard from "./pages/AdminDashboard";
import Dashboard from "./pages/Dashboard";
import GalleryPage from "./pages/Gallery";
import LandingPage from "./pages/Landing";

export const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<LandingPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="home" element={<Dashboard />} />
          <Route path="gallery" element={<GalleryPage />} />
        </Route>
        <Route element={<ProtectedRoute requiresAdmin={true} />}>
          <Route path="admin" element={<AdminDashboard />} />
        </Route>
      </Route>
    </Routes>
  );
};
