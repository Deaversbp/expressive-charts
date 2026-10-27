import { defineConfig, type UserConfig } from "tsdown";

/** The one Node API the build uses. The repo has no Node types (the library never runs Node code), so it's typed here. */
async function writeFile(path: string, text: string): Promise<void> {
  const fs = (await import("node:fs/promises" as string)) as { writeFile(path: string, text: string): Promise<void> };
  await fs.writeFile(path, text);
}

// npm package: ES module + CommonJS + type declarations. The sport icon pack
// ("expressive-charts/icons/sport") and the conformance suite for effect authors
// ("expressive-charts/testing") are their own entries, so the core build carries neither.
const entry = { index: "src/index.ts", "icons/sport": "src/icons/sport/index.ts", testing: "src/testing/index.ts" };

/**
 * What every build shares. `.js` for ES modules and `.cjs` for CommonJS, since the package is "type": "module".
 * Rolldown keeps JSDoc comments by default; the declarations carry them, so the scripts leave them out. The
 * CommonJS files and the script-tag bundle run in strict mode and mark themselves as ES modules (`__esModule`),
 * as tsup's did, so a default import of the CommonJS entry is undefined as before.
 */
const output = { comments: { jsdoc: false }, strict: true, esModule: true, generatedCode: { symbols: false } } as const;
const shared = { sourcemap: true, target: "es2020", fixedExtension: false, outputOptions: output } as const;

/** Rolldown's oxc writes the declarations from each file alone, with no TypeScript: the code passes isolatedDeclarations (tsconfig.json). */
const declarations = { generator: "oxc" } as const;

/** Keeps only a build's declarations, for the builds whose scripts another build writes, or that have none. */
const declarationsOnly = {
  name: "declarations-only",
  generateBundle(_options: unknown, bundle: Record<string, unknown>): void {
    for (const file of Object.keys(bundle)) if (!/\.d\.c?ts$/.test(file)) delete bundle[file];
  }
};

const config: UserConfig[] = defineConfig([
  {
    // ES modules and their declarations, in chunks the entries share.
    ...shared,
    entry,
    format: "esm",
    dts: declarations,
    // "expressive-charts/style.css", for pages that load the stylesheet themselves (configure({ injectStyles: false })).
    // The same text the charts inject, so the two can't drift apart. tsdown loads this file with Node, which
    // needs the extension, so the theme is imported here, as Node reads it.
    onSuccess: async () => {
      const { stylesheet } = (await import("./src/charts/render/theme.ts" as string)) as { stylesheet: string };
      await writeFile("dist/expressive-charts.css", stylesheet);
    }
  },
  // CommonJS: each entry a file of its own, sharing nothing, as tsup built them.
  ...Object.entries(entry).map(([name, file]): UserConfig => ({ ...shared, entry: { [name]: file }, format: "cjs", dts: false })),
  {
    // The CommonJS declarations (.d.cts), in chunks the entries share, as the ES modules' are.
    ...shared,
    entry,
    format: "cjs",
    dts: declarations,
    plugins: [declarationsOnly]
  },
  {
    // The stylesheet's types, an empty module, so `import "expressive-charts/style.css"` checks on TypeScript 6 and later.
    ...shared,
    entry: { "expressive-charts.css": "src/style.css.ts" },
    format: ["esm", "cjs"],
    dts: declarations,
    plugins: [declarationsOnly]
  },
  {
    // script-tag bundle: <script src=".../expressive-charts.global.js"> exposes window.ExpressiveCharts
    ...shared,
    entry: { "expressive-charts": "src/index.ts" },
    format: "iife",
    globalName: "ExpressiveCharts",
    minify: true,
    dts: false,
    // tsdown would name it expressive-charts.iife.js.
    outputOptions: { ...output, entryFileNames: "[name].global.js" }
  }
]);

export default config;
