import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      workbox: { importScripts: ["push-sw.js"] }, // push and notificationclick handlers (SPEC 5)
      manifest: {
        name: "life-life-life",
        short_name: "life",
        display: "standalone",
        background_color: "#fff7ef",
        theme_color: "#fff7ef",
        start_url: "./",
        scope: "./",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "apple-touch-icon.png", sizes: "180x180", type: "image/png" },
        ],
      },
    }),
  ],
});
