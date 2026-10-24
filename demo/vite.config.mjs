// The demo site: `npm run build:site` builds every page here into site/, which
// .github/workflows/pages.yml publishes on GitHub Pages. `npm run dev` reads this file too, and nothing
// in it changes what that serves.
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = fileURLToPath(new URL(".", import.meta.url));

// Each page is an entry of its own: by itself Vite builds index.html, not the pages it links to.
const pages = Object.fromEntries(
  readdirSync(here)
    .filter((file) => file.endsWith(".html"))
    .map((file) => [file.slice(0, -".html".length), here + file])
);

export default defineConfig({
  // Relative, so the same build works at https://deaversbp.github.io/expressive-charts/, under
  // `vite preview demo`, and anywhere else it's copied to.
  base: "./",
  build: {
    outDir: "../site",
    emptyOutDir: true,
    rolldownOptions: { input: pages },
    // The line page's chunk carries Vega and Vega-Lite, about 770 KB, 260 KB gzipped.
    chunkSizeWarningLimit: 1000
  }
});
