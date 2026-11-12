import { defineConfig, type ViteUserConfig } from "vitest/config";

const config: ViteUserConfig = defineConfig({
  // The effects guide's worked examples (docs/sketches/examples/effects) import the library by its
  // package name, as an author's code would; src/effects-guide.test.ts runs them against the source.
  resolve: { alias: [{ find: /^expressive-charts$/, replacement: "/src/index.ts" }] },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.ts"],
    // One jsdom for each worker, not one for each file: the suite takes a third to a half less time
    // (41 to 50 s against 72 to 98 s with a quarter of the workers, in M16 step 1), since making a
    // jsdom for each file was about 40% of it.
    // So the files a worker runs share its document and its modules, and a test mustn't lean on a
    // fresh one: it removes what it adds (a page's <style> too), and hears report() through a stubbed
    // reportError rather than by mocking a module another file may have loaded already.
    isolate: false,
    // 15 s, not Vitest's 5: on a loaded machine, and on CI's slower runner, a few heavy tests (1,000
    // bars laid out 96 ways in bar-layout.test.ts) come near 5 s, though each takes about 1 s alone.
    // Tests that time themselves keep their own limits.
    testTimeout: 15_000
  }
});

export default config;
