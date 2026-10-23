// The bundle-size check. Measures the built package and fails when a size is over its budget in
// scripts/size-budget.json. Run it after a build:
//
//   npm run build && npm run size
//
// It measures two things:
//   - Each published JS file and the stylesheet, raw and compressed. An ES module entry counts the shared chunks
//     it imports, since loading it fetches them too, and tsup names its chunks by a hash that changes with the code.
//   - Import sets: what a page that imports a few names pays once its bundler has tree-shaken the package. Each set
//     is bundled from dist/index.js with Vite's build API and minified, as a page's build would be, so a change that
//     breaks tree-shaking grows the small sets and fails here.
//
// Budgets are gzip sizes in KB (1,024 bytes). gzip is at level 9, brotli at its default (11). The tables go to the
// console and, in GitHub Actions, to the job summary. CONTRIBUTING.md says when and how to raise a budget.

import { appendFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { build } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const budgets = JSON.parse(readFileSync(join(root, "scripts/size-budget.json"), "utf8"));

/** A page that imports these names from the package; "*" is everything. Each set's name is its budget's key. */
const importSets = [
  ["motion", "animated"],
  ["describe", "matrix"],
  ["expressive", "travel"],
  ["barChart"],
  ["lineChart", "threshold", "playback", "playButton"],
  ["chartSwitch", "donutChart", "barChart"],
  ["*"]
];

if (!existsSync(join(dist, "index.js"))) {
  console.error("No dist/index.js: run `npm run build` first.");
  process.exit(1);
}

const sizes = (bytes) => ({
  raw: bytes.length,
  gzip: gzipSync(bytes, { level: 9 }).length,
  brotli: brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length
});
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
const slash = (path) => path.split("\\").join("/");

// ---- Published files ----

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const published = walk(dist).filter((f) => /\.(c?js|css)$/.test(f));

/** The dist files a file imports or requires by a relative path, directly or through another. */
function closure(file, seen = new Set()) {
  seen.add(file);
  const text = readFileSync(file, "utf8");
  for (const [, spec] of text.matchAll(/(?:\bfrom|\bimport|\brequire\()\s*["'](\.\.?\/[^"']+)["']/g)) {
    const target = resolve(dirname(file), spec);
    if (published.includes(target) && !seen.has(target)) closure(target, seen);
  }
  return seen;
}

const imported = new Set(published.flatMap((f) => [...closure(f)].filter((g) => g !== f)));
const fileRows = published
  .filter((f) => !imported.has(f))
  .map((f) => {
    const parts = [...closure(f)];
    const each = parts.map((p) => sizes(readFileSync(p)));
    const sum = (k) => each.reduce((total, s) => total + s[k], 0);
    const chunks = parts.length - 1;
    return {
      key: slash(relative(root, f)),
      note: chunks ? ` + ${chunks} chunk${chunks === 1 ? "" : "s"}` : "",
      raw: sum("raw"),
      gzip: sum("gzip"),
      brotli: sum("brotli")
    };
  })
  .sort((a, b) => (a.key < b.key ? -1 : 1));

// ---- Import sets ----

const work = mkdtempSync(join(tmpdir(), "expressive-charts-size-"));
const setRows = [];
try {
  const from = JSON.stringify(slash(join(dist, "index.js")));
  for (const [i, names] of importSets.entries()) {
    const entry = join(work, `set-${i}.js`);
    writeFileSync(entry, names[0] === "*" ? `export * from ${from};\n` : `export { ${names.join(", ")} } from ${from};\n`);
    // An app build, as a page's is: lib mode leaves whitespace in ES output. The entry keeps its exports.
    const result = await build({
      configFile: false,
      envFile: false,
      publicDir: false,
      logLevel: "silent",
      root: work,
      build: {
        rolldownOptions: { input: entry, preserveEntrySignatures: "strict" },
        write: false,
        minify: true,
        target: "es2020",
        modulePreload: false,
        reportCompressedSize: false
      }
    });
    const code = (Array.isArray(result) ? result : [result])
      .flatMap((r) => r.output)
      .filter((o) => o.type === "chunk")
      .map((o) => o.code)
      .join("\n");
    const { raw, gzip } = sizes(Buffer.from(code));
    setRows.push({ key: names[0] === "*" ? "everything" : names.join(", "), raw, gzip });
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

// ---- Budgets ----

const problems = [];
const suggest = (bytes) => Math.ceil(((bytes / 1024) * 1.1) / 0.5) * 0.5;
function check(rows, table) {
  const given = budgets[table] ?? {};
  for (const row of rows) {
    row.budget = given[row.key];
    if (row.budget === undefined) {
      row.status = "no budget";
      problems.push(`${row.key} has no budget in ${table}. Today's size plus 10% would be ${suggest(row.gzip)} KB.`);
    } else if (row.gzip > row.budget * 1024) {
      row.status = `**over by ${kb(row.gzip - row.budget * 1024)}**`;
      problems.push(`${row.key} is ${kb(row.gzip)} gzip, over its ${row.budget} KB budget. Today's size plus 10% would be ${suggest(row.gzip)} KB.`);
    } else {
      row.status = "ok";
    }
  }
  for (const key of Object.keys(given)) {
    if (!rows.some((row) => row.key === key)) problems.push(`${table} has a budget for "${key}", which isn't measured.`);
  }
}
check(fileRows, "files");
check(setRows, "importSets");

const budget = (row) => (row.budget === undefined ? "" : `${row.budget} KB`);
const report = [
  "## Bundle size",
  "",
  "Published files. An ES module entry counts the chunks it imports.",
  "",
  "| File | raw | gzip | brotli | gzip budget | |",
  "| --- | ---: | ---: | ---: | ---: | --- |",
  ...fileRows.map((r) => `| \`${r.key}\`${r.note} | ${kb(r.raw)} | ${kb(r.gzip)} | ${kb(r.brotli)} | ${budget(r)} | ${r.status} |`),
  "",
  "Import sets: a page that imports these names, bundled with Vite and minified.",
  "",
  "| A page that imports | min | gzip | gzip budget | |",
  "| --- | ---: | ---: | ---: | --- |",
  ...setRows.map((r) => {
    const names = r.key === "everything" ? "everything" : r.key.split(", ").map((n) => `\`${n}\``).join(", ");
    return `| ${names} | ${kb(r.raw)} | ${kb(r.gzip)} | ${budget(r)} | ${r.status} |`;
  }),
  ""
].join("\n");

console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + "\n");

if (problems.length) {
  console.error(problems.join("\n"));
  if ([...fileRows, ...setRows].some((row) => row.status !== "ok")) {
    console.error("\nRaise a budget only when the growth is meant, and say why in the PR (CONTRIBUTING.md, \"Bundle size\").");
  }
  process.exitCode = 1;
}
