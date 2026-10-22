import { defineConfig } from "vitest/config";

export default defineConfig({
  // The effects guide's worked examples (docs/sketches/examples/effects) import the library by its
  // package name, as an author's code would; src/effects-guide.test.ts runs them against the source.
  resolve: { alias: [{ find: /^expressive-charts$/, replacement: "/src/index.ts" }] },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.ts"]
  }
});
