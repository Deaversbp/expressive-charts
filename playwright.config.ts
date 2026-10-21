// The visual suite: screenshots of demo/bars.html in Chromium, on a stopped clock (tests/visual/demo.ts).
// Baselines come from Linux in the official Playwright image, the one CI runs in, because fonts
// render differently on each OS. CONTRIBUTING.md has the commands.
import { defineConfig } from "@playwright/test";

const PORT = 4173;
const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "tests/visual",
  // No platform in the name: there's one set of baselines, Linux's. Names can be shared between
  // files: the reduced-motion suite checks a viewer's pick against the motion-mode suite's pictures.
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",
  // Elsewhere the DOM checks still run; `npm run test:visual:docker` compares screenshots on any OS.
  ignoreSnapshots: process.platform !== "linux",
  fullyParallel: true,
  forbidOnly: CI,
  // A retry would hide a flaky screenshot rather than fix it.
  retries: 0,
  reporter: CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  expect: {
    toHaveScreenshot: {
      // CSS transitions (hover dimming, the tooltip's fade) jump to their end. The library's own
      // motion isn't CSS: it runs on the fake clock, so mid-travel frames are still captured.
      animations: "disabled",
      caret: "hide",
      scale: "css",
      // Per-pixel colour tolerance below the default 0.2, and a few pixels' slack for anti-aliasing
      // that differs between CPUs. An icon one pixel off changes dozens.
      threshold: 0.1,
      maxDiffPixels: 10
    }
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    browserName: "chromium",
    // Taller than the page, so it never scrolls: a screenshot that scrolled an element into view would
    // move the page under a resting pointer and hover a different bar.
    viewport: { width: 1000, height: 2000 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "no-preference",
    locale: "en-US",
    timezoneId: "UTC",
    trace: "retain-on-failure"
  },
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/bars.html`,
    reuseExistingServer: !CI
  }
});
