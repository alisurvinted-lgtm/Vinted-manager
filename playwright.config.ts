import { defineConfig, devices } from "@playwright/test";
import { normalizeBasePath } from "./src/lib/paths";
const baseURL = `http://127.0.0.1:4173${normalizeBasePath(process.env.PAGES_BASE_PATH)}`;
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  timeout: 45000,
  expect: { timeout: 8000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "webkit-iphone",
      use: { ...devices["iPhone 13"], defaultBrowserType: "webkit" },
    },
  ],
  webServer: {
    command: "npm run preview -- --port 4173 --strictPort",
    url: baseURL,
    reuseExistingServer: false,
  },
});
