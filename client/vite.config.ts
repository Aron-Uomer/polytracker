import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// One env file for the whole project: read env from ../server/.env. Vite still
// only exposes VITE_-prefixed vars to the browser, so server secrets stay safe.
export default defineConfig({
  plugins: [react()],
  envDir: fileURLToPath(new URL("../server", import.meta.url)),
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
