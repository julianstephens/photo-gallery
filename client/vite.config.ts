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
    // To allow additional hosts (e.g., for ngrok), set VITE_ALLOWED_HOSTS="host1,host2"
    allowedHosts: [
      "localhost",
      ...(process.env.VITE_ALLOWED_HOSTS ? process.env.VITE_ALLOWED_HOSTS.split(",") : []),
    ],
  },
});
