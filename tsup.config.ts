import { defineConfig } from "tsup";
import { stylesheet } from "./src/charts/render/theme";

/** The one Node API the build uses. The repo has no Node types (the library never runs Node code), so it's typed here. */
async function writeFile(path: string, text: string): Promise<void> {
  const fs = (await import("node:fs/promises" as string)) as { writeFile(path: string, text: string): Promise<void> };
  await fs.writeFile(path, text);
}

// npm package: ES module + CommonJS + type declarations. The sport icon pack
// ("expressive-charts/icons/sport") and the conformance suite for effect authors
// ("expressive-charts/testing") are their own entries, so the core build carries neither.
const entry = { index: "src/index.ts", "icons/sport": "src/icons/sport/index.ts", testing: "src/testing/index.ts" };

export default defineConfig([
  {
    entry,
    format: ["esm", "cjs"],
    // The stylesheet's types are a declarations entry of their own, not written in onSuccess:
    // the declarations build deletes every .d.ts in dist/ as it starts, alongside onSuccess.
    dts: { entry: { ...entry, "expressive-charts.css": "src/style.css.ts" } },
    sourcemap: true,
    clean: true,
    target: "es2020",
    // "expressive-charts/style.css", for pages that load the stylesheet themselves (configure({ injectStyles: false })).
    // The same text the charts inject, so the two can't drift apart.
    onSuccess: () => writeFile("dist/expressive-charts.css", stylesheet)
  },
  {
    // script-tag bundle: <script src=".../expressive-charts.global.js"> exposes window.ExpressiveCharts
    entry: { "expressive-charts": "src/index.ts" },
    format: ["iife"],
    globalName: "ExpressiveCharts",
    minify: true,
    sourcemap: true,
    target: "es2020"
  }
]);
