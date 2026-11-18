import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: "browser.spec.ts",
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:4175/Vinted-manager/gmail-prototype/",
    trace: "off",
    screenshot: "off",
  },
  reporter: "list",
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "webkit-iphone",
      use: { ...devices["iPhone 13"], defaultBrowserType: "webkit" },
    },
  ],
  webServer: {
    command: "npm run gmail:preview -- --port 4175 --strictPort",
    cwd: new URL("../..", import.meta.url).pathname,
    url: "http://127.0.0.1:4175/Vinted-manager/gmail-prototype/",
    reuseExistingServer: false,
  },
});
