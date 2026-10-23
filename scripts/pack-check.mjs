// Checks the package as npm will publish it, from outside the repository. It packs the tarball,
// installs it in a new project in the system's temporary folder, and uses it as a consumer would:
//   1. the tarball has every file package.json points at, the changelog, and nothing else;
//   2. every entry imports in Node as an ES module and as CommonJS, with no DOM, with the same names;
//   3. a small consumer typechecks against it with this repository's TypeScript, under `bundler`,
//      `node16` (an ES module) and `node16` (CommonJS) resolution, each reading its own types.
// Run it after `npm run build`:
//
//   npm run pack-check              (add `-- --keep` to keep the temporary project for a look)
//
// Node built-ins only. CI runs it after the build, and the release workflow before publishing.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const keep = process.argv.includes("--keep");
const failures = [];

/** The files an exports target leads to, through every condition. */
const targets = (target) => (typeof target === "string" ? [target] : Object.values(target).flatMap(targets));

/** The JavaScript entries, by the name a consumer imports ("expressive-charts/testing"), with their exports targets. */
const scripts = Object.entries(pkg.exports)
  .filter(([, target]) => typeof target !== "string")
  .map(([path, target]) => ({ entry: path === "." ? pkg.name : `${pkg.name}/${path.slice(2)}`, target }));
const entries = scripts.map(({ entry }) => entry);
const pointedAt = [pkg.main, pkg.module, pkg.types, ...Object.values(pkg.exports).flatMap(targets)].map((file) => file.replace(/^\.\//, ""));
/** What npm adds to every tarball, and what `files` adds beside dist/. */
const besideDist = ["package.json", "README.md", "LICENSE", "CHANGELOG.md"];

function fail(message) {
  failures.push(message);
  console.log(`  FAIL ${message}`);
}

function ok(message) {
  console.log(`  ok   ${message}`);
}

/**
 * Runs npm. As an npm script, through Node and npm's own CLI file, so Windows needs no shell; from a
 * terminal, through the shell, which finds npm.cmd.
 */
function npm(args, cwd) {
  const options = { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] };
  const cli = process.env.npm_execpath;
  if (cli && /npm-cli\.[cm]?js$/.test(cli)) return execFileSync(process.execPath, [cli, ...args], options);
  return execFileSync("npm", args.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg)), { ...options, shell: true });
}

/** Runs Node on a file in the consumer project and parses what it prints. */
function node(file, cwd) {
  const result = spawnSync(process.execPath, [file], { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`node ${file} failed:\n${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout);
}

/** The types file a condition ("import" or "require") leads to, or the entry's own `types` if it has no such branch. */
function typesFile(target, condition) {
  const branch = typeof target[condition] === "object" ? target[condition] : target;
  return typeof branch.types === "string" ? branch.types.replace(/^\.\//, "") : undefined;
}

const megabytes = (bytes) => `${(bytes / 1e6).toFixed(2)} MB`;

const missing = pointedAt.filter((file) => !existsSync(join(root, file)));
if (missing.length > 0) {
  console.error(`pack-check: ${missing.join(", ")} missing. Run \`npm run build\` first.`);
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), "expressive-charts-pack-check-"));
try {
  // 1. The tarball.
  console.log("The tarball");
  const [packed] = JSON.parse(npm(["pack", "--json", "--loglevel=warn", "--pack-destination", work], root));
  const files = new Set(packed.files.map((file) => file.path));
  console.log(`       ${packed.filename}: ${packed.entryCount} files, ${megabytes(packed.size)} packed, ${megabytes(packed.unpackedSize)} unpacked`);
  const absent = [...new Set([...pointedAt, ...besideDist])].filter((file) => !files.has(file));
  if (absent.length > 0) fail(`the tarball has no ${absent.join(", ")}`);
  else ok(`has every file package.json points at, and ${besideDist.join(", ")}`);
  const stray = [...files].filter((file) => !file.startsWith("dist/") && !besideDist.includes(file));
  if (stray.length > 0) fail(`the tarball has files outside dist/: ${stray.join(", ")}`);
  else ok("has nothing else outside dist/");

  // The consumer: a new project with the tarball installed and nothing else.
  const app = join(work, "consumer");
  mkdirSync(app);
  writeFileSync(join(app, "package.json"), JSON.stringify({ name: "pack-check-consumer", private: true, type: "module" }, null, 2));
  npm(["install", `../${packed.filename}`, "--no-audit", "--no-fund", "--ignore-scripts", "--no-package-lock", "--loglevel=warn"], app);
  // Node resolves through symlinks (macOS's temporary folder is one), so the comparison does too.
  const installed = realpathSync(join(app, "node_modules", ...pkg.name.split("/")));

  // 2. Node, with no DOM.
  console.log("Node, with no DOM");
  writeFileSync(join(app, "esm.mjs"), runtimeCheck("esm"));
  writeFileSync(join(app, "cjs.cjs"), runtimeCheck("cjs"));
  const esm = node("esm.mjs", app);
  const cjs = node("cjs.cjs", app);
  for (const [format, result] of [["ES modules", esm], ["CommonJS", cjs]]) {
    const outside = Object.entries(result.files).filter(([, file]) => !file.startsWith(installed + sep));
    if (result.dom !== "undefined undefined") fail(`${format}: the check ran with a DOM (${result.dom})`);
    else if (outside.length > 0) fail(`${format}: ${outside.map(([entry, file]) => `${entry} resolved to ${file}`).join(", ")}, not to the installed package`);
    else if (result.version !== pkg.version) fail(`${format}: VERSION is ${result.version}, but package.json's version is ${pkg.version}`);
    else if (result.smoke.length > 0) fail(`${format}: ${result.smoke.join("; ")}`);
    else ok(`imports ${entries.length} entries as ${format}, and the stylesheet resolves (${relative(installed, result.files.css)})`);
  }
  const differ = entries.filter((entry) => esm.names[entry].join() !== cjs.names[entry].join());
  const empty = entries.filter((entry) => esm.names[entry].length === 0);
  if (empty.length > 0) fail(`${empty.join(", ")} export nothing`);
  for (const entry of differ) {
    const onlyEsm = esm.names[entry].filter((name) => !cjs.names[entry].includes(name));
    const onlyCjs = cjs.names[entry].filter((name) => !esm.names[entry].includes(name));
    fail(`${entry}: only as an ES module: ${onlyEsm.join(", ") || "none"}; only as CommonJS: ${onlyCjs.join(", ") || "none"}`);
  }
  if (empty.length + differ.length === 0) ok(`each entry has the same names both ways (${entries.map((entry) => `${entry}: ${esm.names[entry].length}`).join(", ")})`);

  // 3. Types, with this repository's TypeScript.
  const tsc = createRequire(join(root, "package.json")).resolve("typescript/bin/tsc");
  const tsVersion = JSON.parse(readFileSync(join(dirname(tsc), "..", "package.json"), "utf8")).version;
  console.log(`Types, with TypeScript ${tsVersion}`);
  const resolutions = [
    { name: "bundler", file: "bundler.ts", module: "esnext", moduleResolution: "bundler", condition: "import" },
    { name: "node16, an ES module", file: "node16-esm.mts", module: "node16", moduleResolution: "node16", condition: "import" },
    { name: "node16, CommonJS", file: "node16-cjs.cts", module: "node16", moduleResolution: "node16", condition: "require" }
  ];
  for (const { name, file, module, moduleResolution, condition } of resolutions) {
    const config = `tsconfig.${file.replace(/\.\w+$/, "")}.json`;
    const compilerOptions = {
      target: "es2020",
      lib: ["es2020", "dom", "dom.iterable"],
      module,
      moduleResolution,
      strict: true,
      noEmit: true,
      // The package's declarations are checked too, as in a project that doesn't skip them.
      skipLibCheck: false,
      types: []
    };
    writeFileSync(join(app, file), consumerSource());
    writeFileSync(join(app, config), JSON.stringify({ compilerOptions, files: [file] }, null, 2));
    const checked = spawnSync(process.execPath, [tsc, "-p", config], { cwd: app, encoding: "utf8" });
    // Which declarations it read: each entry's own for this condition, as package.json names them.
    const listed = spawnSync(process.execPath, [tsc, "-p", config, "--listFilesOnly"], { cwd: app, encoding: "utf8" });
    const read = listed.stdout.split(/\r?\n/).map((line) => line.replace(/\\/g, "/"));
    const expected = scripts.map(({ target }) => typesFile(target, condition));
    const unread = expected.filter((declaration) => declaration === undefined || !read.some((line) => line.endsWith(`/node_modules/${pkg.name}/${declaration}`)));
    if (checked.status !== 0) fail(`${name}: tsc found errors:\n${(checked.stdout + checked.stderr).trim()}`);
    else if (unread.length > 0) fail(`${name}: it typechecks, but without ${unread.map((declaration) => declaration ?? "an entry's types").join(", ")}`);
    else ok(`${name}: typechecks, reading ${expected.join(", ")}`);
  }
} finally {
  if (keep) console.log(`\nThe temporary project is in ${work}`);
  else rmSync(work, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`\npack-check: ${failures.length} ${failures.length === 1 ? "check" : "checks"} failed.`);
  process.exit(1);
}
console.log("\npack-check: the package works as ES modules and as CommonJS, with its types.");

/**
 * A small consumer, the same source as .ts, .mts and .cts: an effect written with the author API, a
 * chart, the sport pack and the conformance suite. The `@ts-expect-error` shows the types are real
 * rather than `any`: a field the rows don't have must be an error.
 */
function consumerSource() {
  return `import { barChart, defineEffect, describe, matrix, travel, VERSION, type EffectContext, type MarkGeometry } from "${pkg.name}";
import { soccerBall } from "${pkg.name}/icons/sport";
import { checkEffect, fixtures, type CheckEffectOptions } from "${pkg.name}/testing";

export const version: string = VERSION;

export const underline = defineEffect({
  async run(mark: MarkGeometry, ctx: EffectContext) {
    const line = ctx.layer.path(mark.slice(0, 0), { stroke: "text", width: 2 });
    await ctx.tween({ duration: 300, timing: "effect", update: (p) => line.update(mark.slice(0, p)) }).finished;
  },
  end(mark, ctx) {
    ctx.layer.path(mark.slice(0, 1), { stroke: "text", width: 2 });
  }
});

interface Row {
  readonly name: string;
  readonly goals: number;
}

export function draw(target: Element, data: readonly Row[]) {
  // @ts-expect-error "shots" isn't a field of Row.
  barChart(target, { label: "Shots", data, y: "name", x: "shots" });
  return barChart(target, { label: "Goals", data, y: "name", x: "goals", on: { hover: underline, enter: travel(soccerBall) } });
}

export const bar = describe.bar({ key: "a", x: 0, y: 0, width: 100, height: 20, baseline: "left" });
export const moved = matrix.apply(matrix.translate(1, 2), bar.center);
export const options: CheckEffectOptions = { marks: [fixtures.bar, bar], icons: [soccerBall] };
export const check = (): Promise<void> => checkEffect(underline, options);
`;
}

/**
 * The script that imports every entry, as ES modules or as CommonJS, and prints what it found: each
 * entry's names, the files they resolved to, whether there was a DOM, VERSION, and anything a few
 * calls got wrong.
 */
function runtimeCheck(format) {
  const esm = format === "esm";
  const load = esm ? "await import(entry)" : "require(entry)";
  const resolve = esm ? "fileURLToPath(import.meta.resolve(entry))" : "require.resolve(entry)";
  return `${esm ? 'import { fileURLToPath } from "node:url";' : "(async () => {"}
const entries = ${JSON.stringify(entries)};
const names = {};
const files = {};
const loaded = {};
for (const entry of entries) {
  loaded[entry] = ${load};
  names[entry] = Object.keys(loaded[entry]).filter((name) => name !== "default" && name !== "__esModule").sort();
  files[entry] = ${resolve};
}
{
  const entry = ${JSON.stringify(`${pkg.name}/style.css`)};
  files.css = ${resolve};
}
const lib = loaded[${JSON.stringify(pkg.name)}];
const sport = loaded[${JSON.stringify(`${pkg.name}/icons/sport`)}];
const testing = loaded[${JSON.stringify(`${pkg.name}/testing`)}];
const smoke = [];
const middle = lib.describe.bar({ key: "a", x: 0, y: 0, width: 100, height: 20, baseline: "left" }).path(0.5);
if (middle.x !== 50 || middle.y !== 10) smoke.push("describe.bar's path(0.5) is " + JSON.stringify(middle));
if (lib.motion.mode !== "presentation") smoke.push("motion.mode is " + lib.motion.mode);
if (sport.soccerBall?.name !== "soccer-ball") smoke.push("the sport pack has no soccerBall");
if (Object.keys(testing.fixtures ?? {}).length === 0) smoke.push("the testing entry has no fixtures");
console.log(JSON.stringify({ names, files, dom: typeof window + " " + typeof document, version: lib.VERSION, smoke }));
${esm ? "" : "})().catch((error) => { console.error(error); process.exit(1); });"}
`;
}
