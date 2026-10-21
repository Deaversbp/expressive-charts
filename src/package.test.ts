// @vitest-environment node
// package.json: bundlers keep `import "expressive-charts/style.css"`, and nothing else loses tree shaking.
//
// The CSS import has no bindings, so a bundler that honours "sideEffects" drops it unless the CSS
// file is listed there, and the page that set injectStyles: false loses its styles without an error.
// Webpack does this. Vite 8 (Rolldown) and esbuild 0.28, the bundlers in this repo, keep the import
// even with "sideEffects": false, so a test build with them can't catch the regression; webpack and
// css-loader would be two dev dependencies for one check. So this checks the metadata instead, with
// the pattern rules webpack, Rollup's node-resolve and esbuild share.

interface PackageJson {
  readonly main: string;
  readonly module: string;
  readonly exports: Readonly<Record<string, string | Readonly<Record<string, string>>>>;
  readonly sideEffects: boolean | readonly string[];
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

/** Every file the package exposes: main, module and each exports target. */
function entryFiles(pkg: PackageJson): string[] {
  const targets = Object.values(pkg.exports).flatMap((target) => (typeof target === "string" ? [target] : Object.values(target)));
  return [pkg.main, pkg.module, ...targets];
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

  it("reads patterns as bundlers do", () => {
    expect(hasSideEffects(false, "./dist/expressive-charts.css")).toBe(false);
    expect(hasSideEffects(["*.css"], "./dist/expressive-charts.css")).toBe(true);
    expect(hasSideEffects(["./dist/*.css"], "./dist/expressive-charts.css")).toBe(true);
    expect(hasSideEffects(["./src/*.css"], "./dist/expressive-charts.css")).toBe(false);
    expect(hasSideEffects(["**/*.css"], "./dist/icons/sport.js")).toBe(false);
  });
});
