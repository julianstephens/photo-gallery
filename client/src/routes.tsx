import { Routes, Route } from "react-router";
import GalleryPage from "./pages/Gallery";

export const AppRoutes = () => {
  return (
    <Routes>
      <Route index element=<GalleryPage /> />
    </Routes>
  );
};
