import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import config from "./config.json";
import { isApproved } from "./session";
const base = "/Vinted-manager/gmail-prototype/";
const approved = isApproved(config);
// Aucune dérogation réseau lorsque le prototype est désactivé.
const csp = approved
  ? "default-src 'none'; script-src 'self' https://accounts.google.com/gsi/client; style-src 'self'; img-src 'self'; connect-src https://accounts.google.com/gsi/ https://gmail.googleapis.com/gmail/v1/users/me/profile; frame-src https://accounts.google.com/gsi/; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'"
  : "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; frame-src 'none'; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base,
  publicDir: false,
  esbuild: { drop: ["console", "debugger"] },
  plugins: [
    react(),
    {
      name: "gmail-prototype-boundaries",
      transformIndexHtml: () => [
        {
          tag: "meta",
          attrs: { "http-equiv": "Content-Security-Policy", content: csp },
          injectTo: "head-prepend",
        },
      ],
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "manifest.webmanifest",
          source: JSON.stringify({
            id: base,
            name: "Vinted Manager · Test Gmail",
            short_name: "Test Gmail",
            lang: "fr",
            start_url: base,
            scope: base,
            display: "standalone",
            theme_color: "#176453",
            background_color: "#f6f7f4",
          }),
        });
      },
    },
  ],
  build: {
    outDir: fileURLToPath(
      new URL("../../.prototype-build/gmail-oauth", import.meta.url),
    ),
    emptyOutDir: true,
    sourcemap: false,
  },
  preview: {
    host: "127.0.0.1",
    headers: {
      "Cache-Control": "no-store",
      "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
      "Referrer-Policy": "no-referrer",
    },
  },
});
