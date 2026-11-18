import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { normalizeBasePath } from "./src/lib/paths";

const base = normalizeBasePath(process.env.PAGES_BASE_PATH);
const csp =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";

export default defineConfig({
  base,
  esbuild: { drop: ["console", "debugger"] },
  plugins: [
    {
      name: "security-meta",
      apply: "build",
      transformIndexHtml: () => [
        {
          tag: "meta",
          attrs: { "http-equiv": "Content-Security-Policy", content: csp },
          injectTo: "head-prepend",
        },
        {
          tag: "meta",
          attrs: { name: "referrer", content: "no-referrer" },
          injectTo: "head-prepend",
        },
      ],
    },
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      base,
      scope: base,
      includeAssets: ["favicon.svg", "icons/apple-touch-icon.png"],
      manifest: {
        id: base,
        name: "Vinted Manager",
        short_name: "Vinted Manager",
        lang: "fr",
        description:
          "Votre activité de seconde main, simplement. Stock, ventes et bénéfices sur votre appareil.",
        theme_color: "#176453",
        background_color: "#f6f7f4",
        display: "standalone",
        start_url: base,
        scope: base,
        icons: [
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        clientsClaim: true,
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
        runtimeCaching: [],
        globIgnores: ["**/*.json", "**/*.csv", "**/*.vmbackup", "**/*.map"],
        navigateFallbackDenylist: [
          /\.(?:json|csv|vmbackup|zip)$/i,
          /\/gmail-prototype(?:\/|$)/,
        ],
      },
    }),
  ],
});
