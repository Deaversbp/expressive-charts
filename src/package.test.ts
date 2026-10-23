// @vitest-environment node
// package.json: bundlers keep `import "expressive-charts/style.css"`, nothing else loses tree shaking,
// installing the library installs nothing else, and each entry gives ES modules and CommonJS their own
// types. scripts/pack-check.mjs installs the packed tarball and checks the same from outside.
//
// The CSS import has no bindings, so a bundler that honours "sideEffects" drops it unless the CSS
// file is listed there, and the page that set injectStyles: false loses its styles without an error.
// Webpack does this. Vite 8 (Rolldown) and esbuild 0.28, the bundlers in this repo, keep the import
// even with "sideEffects": false, so a test build with them can't catch the regression; webpack and
// css-loader would be two dev dependencies for one check. So this checks the metadata instead, with
// the pattern rules webpack, Rollup's node-resolve and esbuild share.

import { VERSION } from "./index";

/** An exports target: a file, or conditions ("import", "require", "types", "default") that lead to more targets. */
type Target = string | { readonly [condition: string]: Target };

interface PackageJson {
  readonly version: string;
  readonly main: string;
  readonly module: string;
  readonly exports: Readonly<Record<string, Target>>;
  readonly files: readonly string[];
  readonly sideEffects: boolean | readonly string[];
  readonly dependencies?: Readonly<Record<string, string>>;
}

async function packageJson(): Promise<PackageJson> {
  // Node APIs aren't typed in this repo (the library never runs Node code), so the one used is typed here.
  const fs = (await import("node:fs/promises" as string)) as { readFile(path: URL, encoding: "utf8"): Promise<string> };
  return JSON.parse(await fs.readFile(new URL("../package.json", import.meta.url), "utf8")) as PackageJson;
}

/** A glob as a regular expression: `**` crosses folders, `*` doesn't. */
function glob(pattern: string): RegExp {
  const source = pattern
    .split(/(\*\*\/|\*\*|\*)/)
    .map((part) => (part === "**/" ? "(?:.*/)?" : part === "**" ? ".*" : part === "*" ? "[^/]*" : part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")))
    .join("");
  return new RegExp(`^${source}$`);
}

/**
 * Whether a file in the package counts as having side effects. A pattern with no "/" matches the file
 * name in any folder; otherwise it matches the path from the package root.
 */
function hasSideEffects(sideEffects: PackageJson["sideEffects"], file: string): boolean {
  if (typeof sideEffects === "boolean") return sideEffects;
  const path = file.replace(/^\.\//, "");
  return sideEffects.some((pattern) => glob(pattern.includes("/") ? pattern.replace(/^\.\//, "") : `**/${pattern}`).test(path));
}

/** The files a target leads to, through every condition. */
function files(target: Target): string[] {
  return typeof target === "string" ? [target] : Object.values(target).flatMap(files);
}

/** Every file the package exposes: main, module and each exports target. */
function entryFiles(pkg: PackageJson): string[] {
  return [pkg.main, pkg.module, ...Object.values(pkg.exports).flatMap(files)];
}

describe("package.json", () => {
  it("exports the stylesheet the build writes", async () => {
    const pkg = await packageJson();
    expect(pkg.exports["./style.css"]).toBe("./dist/expressive-charts.css");
  });

  it("marks the CSS as having side effects, so bundlers keep the import", async () => {
    const pkg = await packageJson();
    const css = entryFiles(pkg).filter((file) => file.endsWith(".css"));
    expect(css).toEqual(["./dist/expressive-charts.css"]);
    for (const file of css) expect(hasSideEffects(pkg.sideEffects, file), file).toBe(true);
  });

  it("keeps every JavaScript entry free of side effects, so unused exports are dropped", async () => {
    const pkg = await packageJson();
    const scripts = entryFiles(pkg).filter((file) => !file.endsWith(".css"));
    expect(scripts.length).toBeGreaterThan(4);
    for (const file of scripts) expect(hasSideEffects(pkg.sideEffects, file), file).toBe(false);
  });

  it("exports the conformance suite as its own entry, free of side effects", async () => {
    const pkg = await packageJson();
    expect(pkg.exports["./testing"]).toEqual({
      import: { types: "./dist/testing.d.ts", default: "./dist/testing.js" },
      require: { types: "./dist/testing.d.cts", default: "./dist/testing.cjs" }
    });
    for (const file of entryFiles(pkg).filter((file) => file.startsWith("./dist/testing."))) expect(hasSideEffects(pkg.sideEffects, file), file).toBe(false);
    const testing = await import("./testing");
    expect(Object.keys(testing).sort()).toEqual(["checkEffect", "checkTransition", "fixturePairs", "fixtures", "play", "testContext"]);
  });

  it("gives each JavaScript entry's import and require their own types, .d.ts and .d.cts", async () => {
    // The package is "type": "module", so a .d.ts describes an ES module. A CommonJS project resolving
    // with node16 would be given ES module types for the .cjs file unless require has its own.
    const pkg = await packageJson();
    const scripts = Object.entries(pkg.exports).filter(([, target]) => typeof target !== "string");
    expect(scripts.map(([entry]) => entry)).toEqual([".", "./icons/sport", "./testing"]);
    for (const [entry, target] of scripts) {
      const base = entry === "." ? "./dist/index" : `./dist/${entry.slice(2)}`;
      expect(target, entry).toEqual({
        import: { types: `${base}.d.ts`, default: `${base}.js` },
        require: { types: `${base}.d.cts`, default: `${base}.cjs` }
      });
    }
  });

  it("ships the changelog, where the 0.x promise is, beside the build", async () => {
    const pkg = await packageJson();
    expect(pkg.files).toEqual(["dist", "CHANGELOG.md"]);
  });

  it("has VERSION equal to package.json's version", async () => {
    const pkg = await packageJson();
    expect(VERSION).toBe(pkg.version);
  });

  it("has no runtime dependencies: D3 and the other libraries the tests use are dev dependencies", async () => {
    const pkg = await packageJson();
    expect(Object.keys(pkg.dependencies ?? {})).toEqual([]);
  });

  it("reads patterns as bundlers do", () => {
    expect(hasSideEffects(false, "./dist/expressive-charts.css")).toBe(false);
    expect(hasSideEffects(["*.css"], "./dist/expressive-charts.css")).toBe(true);
    expect(hasSideEffects(["./dist/*.css"], "./dist/expressive-charts.css")).toBe(true);
    expect(hasSideEffects(["./src/*.css"], "./dist/expressive-charts.css")).toBe(false);
    expect(hasSideEffects(["**/*.css"], "./dist/icons/sport.js")).toBe(false);
  });
});
