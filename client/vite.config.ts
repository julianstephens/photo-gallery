import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
    allowedHosts: ["localhost", "exciting-bird-resolved.ngrok-free.app"],
  },
});
