import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
// Serves api/ during `npm run dev`. `apply: 'serve'` inside the plugin means
// it never takes part in a production build — Vercel runs those files itself.
import devApi from "./scripts/seating/dev-api.mjs";

export default defineConfig({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), devApi()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
