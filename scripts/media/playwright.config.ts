// The capture's Playwright config (capture.ts, README's pictures): Chromium on the visual suite's
// settings, but narrower, so a picture is about as wide as README shows it, two to a row, and at twice
// the pixels, so it's sharp on a high-density screen. Vite serves the repository's root, so the demo
// pages and quick-start.html beside this file share one server.
import { defineConfig } from "@playwright/test";

const PORT = 4174;

export default defineConfig({
  testDir: ".",
  testMatch: "capture.ts",
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  timeout: 120_000,
  use: {
    browserName: "chromium",
    baseURL: `http://localhost:${PORT}`,
    // Tall enough that no page scrolls, as in the visual suite: the line page is about 5,300 px at this width.
    viewport: { width: 440, height: 6000 },
    deviceScaleFactor: 2,
    colorScheme: "light",
    reducedMotion: "no-preference",
    locale: "en-US",
    timezoneId: "UTC"
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    cwd: "../..",
    url: `http://localhost:${PORT}/demo/bars.html`,
    reuseExistingServer: !process.env.CI
  }
});
