import { defineConfig, devices } from "@playwright/test";
import { CAMERA_VIDEO } from "./tests/barcodes";

// Browser tests of the whole site. Playwright starts both servers itself:
// the API on a fresh database with demo data, and the production build of the frontend
// (run `npm run build` in frontend/ first). Tests share one database, so they run one by one.
export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.ts",
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    locale: "ru-RU",
    viewport: { width: 1280, height: 860 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      testIgnore: /camera\.spec/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 } },
    },
    {
      name: "camera",
      testMatch: /camera\.spec/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 860 },
        permissions: ["camera"],
        launchOptions: {
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            `--use-file-for-fake-video-capture=${CAMERA_VIDEO}`,
          ],
        },
      },
    },
  ],
  webServer: [
    {
      command: "sh scripts/start-backend.sh",
      url: "http://127.0.0.1:8000/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: "npm run start -- --port 3000",
      cwd: "../frontend",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
