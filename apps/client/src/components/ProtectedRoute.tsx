import { Loader } from "@/components/Loader";
import { useAuth } from "@/hooks";
import { Navigate, Outlet, useLocation } from "react-router";

export const ProtectedRoute = ({ requiresAdmin }: { requiresAdmin?: boolean }) => {
  const { isAuthed, authReady, loading, currentUser } = useAuth();
  const location = useLocation();

  if (!authReady || loading) {
    return <Loader />;
  }

  if (!isAuthed) {
    return <Navigate to="/" replace state={{ returnTo: location.pathname }} />;
  }

  if (requiresAdmin && !currentUser?.isAdmin) {
    return <Navigate to="/" replace state={{ from: location, returnTo: location.pathname }} />;
  }

  return <Outlet />;
};
