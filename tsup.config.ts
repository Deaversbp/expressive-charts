import { defineConfig } from "tsup";

export default defineConfig([
  {
    // npm package: ES module + CommonJS + type declarations. The sport icon pack is its own entry
    // ("expressive-charts/icons/sport"), so the core build doesn't carry it.
    entry: { index: "src/index.ts", "icons/sport": "src/icons/sport/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    target: "es2020"
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
