// The stress benchmark: runs every case of demo/stress.html at every size in headless Chromium, on the
// real clock, and prints the results as markdown tables. Not run in CI, since timings are noisy.
//
//   npm run bench                             every case, 1× and 4× CPU, 5 repetitions (about an hour)
//   npm run bench -- --cases line,host        some cases only
//   npm run bench -- --reps 1 --rates 1       a quick look
//   npm run bench -- --cases line --line-sizes 10 --line-series 2   some sizes and options only
//   npm run bench -- --url http://localhost:5173/   against `npm run dev`, already running
//   npm run bench -- --affinity 0xffff        Windows: keep the browser on these logical CPUs
//   npm run bench -- --json results.json      also write every repetition as JSON
//
// Each repetition is a fresh page: it picks the case's size and options with the page's own buttons,
// collects garbage, sets the CPU slowdown (CDP's Emulation.setCPUThrottlingRate, Lighthouse's way of
// imitating a mid-range phone at 4×), presses the case's start button, and waits for its readout. The
// page measures its frames (demo/stress.ts); this adds the main thread's work per frame, Chrome's
// TaskDuration over the run divided by its frames, as M4 step 6 measured watch. The median of the
// repetitions is reported. A size is smooth when the medians have a 95th-percentile frame interval of
// 20 ms or less and no frame over 50 ms, and on the hover case when every hover showed within 100 ms.
//
// Then it creates and destroys each case's chart 50 times (switching between two sizes and back) and
// checks that DOM nodes and event listeners come back to where they started, after garbage collection.
//
// The machine must be quiet: another browser, a test suite or a Docker run at the same time can
// double every number. So each repetition first times a fixed loop in the page (unthrottled), and the
// header gives that loop's range over the whole run: a run whose slowest loop is well over its fastest
// was shared, and its numbers aren't comparable.
//
// On a CPU with performance and efficiency cores (Intel's 12th generation and later), Windows moves
// the renderer between core types and whole runs drift by 2× (M4 step 6). --affinity pins this
// process to the given logical CPUs before the browser starts, and the browser inherits it.

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { cpus, platform, release, totalmem } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));

// ---- Options ----

const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (!arg.startsWith("--")) throw new Error(`Unknown argument ${arg}; options start with --.`);
  const value = process.argv[i + 1];
  if (value === undefined || value.startsWith("--")) args.set(arg.slice(2), "true");
  else args.set(arg.slice(2), process.argv[++i]);
}
const list = (name, fallback) => (args.has(name) ? args.get(name).split(",").filter(Boolean) : fallback);
const REPS = Number(args.get("reps") ?? 5);
const RATES = list("rates", ["1", "4"]).map(Number);
const CYCLES = Number(args.get("cycles") ?? 50);
const PORT = Number(args.get("port") ?? 5199);
/** How long one run may take before the bench gives up on it: a 10-year line's play at 4× is the slowest. */
const TIMEOUT = 300_000;

/**
 * The cases, as the page has them: each card's sizes and options (the values of its pickers' buttons),
 * its start button, and the two sizes the create-and-destroy check switches between.
 */
const CASES = {
  update: { title: "Bars that update", card: "#update-case", unit: "Bars", sizes: [100, 500, 1000, 2000, 5000], options: { effect: ["none", "flash"] }, cycle: [100, 500] },
  hover: { title: "Hover on a large chart", card: "#hover-case", unit: "Bars", sizes: [100, 500, 1000, 2000, 5000], options: {}, cycle: [100, 500] },
  line: {
    title: "A line on dates, playing",
    card: "#line-case",
    unit: "Years",
    sizes: [1, 2, 5, 10],
    options: { series: ["1", "2", "3", "4"] },
    start: "#line-play button",
    cycle: [1, 2]
  },
  host: { title: "Host columns with watch", card: "#host-case", unit: "Columns", sizes: [20, 100, 200, 500, 1000, 2000], options: { follow: ["watch", "refresh"] }, cycle: [20, 100] },
  switch: { title: "A switch with many pairs", card: "#switch-case", unit: "Bars", sizes: [20, 100, 200, 500, 1000], options: {}, cycle: [20, 100] },
  draw: { title: "The first draw", card: "#draw-case", unit: "Columns", sizes: [1000, 2000, 5000, 10000], options: {}, cycle: [1000, 2000] }
};
const chosen = list("cases", Object.keys(CASES));
for (const name of chosen) if (!(name in CASES)) throw new Error(`Unknown case "${name}". Cases: ${Object.keys(CASES).join(", ")}.`);

if (args.has("affinity")) {
  if (platform() !== "win32") throw new Error("--affinity is for Windows; elsewhere, run the bench under taskset.");
  execFileSync("powershell", ["-NoProfile", "-Command", `(Get-Process -Id ${process.pid}).ProcessorAffinity = ${Number(args.get("affinity"))}`]);
}

// ---- The page ----

let server;
let base = args.get("url");
if (!base) {
  // What `npm run dev` serves: Vite on the demo folder.
  server = await createServer({ root: join(root, "demo"), configFile: false, logLevel: "error", server: { port: PORT, strictPort: true } });
  await server.listen();
  base = `http://localhost:${PORT}/`;
}
const url = new URL("stress.html", base).href;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1000, height: 2000 }, deviceScaleFactor: 1, locale: "en-US", timezoneId: "UTC" });

/** A fresh page with the stress demo drawn, and a CDP session on it. */
async function open() {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(url);
  await page.locator("#draw-chart .ec-mark").first().waitFor();
  await frames(page, 2);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  return { page, cdp, errors };
}

/** Waits for `n` frames. */
const frames = (page, n) =>
  page.evaluate(
    (count) =>
      new Promise((resolve) => {
        const step = (left) => (left === 0 ? resolve() : requestAnimationFrame(() => step(left - 1)));
        step(count);
      }),
    n
  );

/** Presses a picker's button, unless it's already pressed. */
async function pick(page, card, picker, value) {
  const button = page.locator(`${card} [data-${picker}] button[data-value="${value}"]`);
  if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
}

/** The main thread's busy time so far, in ms. */
async function taskMs(cdp) {
  const { metrics } = await cdp.send("Performance.getMetrics");
  return (metrics.find((metric) => metric.name === "TaskDuration")?.value ?? 0) * 1000;
}

/** Presses `start` and resolves with the readout's data once it reports the run, watching with no polling. */
async function run(page, card, start) {
  const readout = `${card} [data-readout]`;
  const before = Number((await page.locator(readout).getAttribute("data-run")) ?? 0);
  const done = page.evaluate(
    ([selector, runs]) =>
      new Promise((resolve) => {
        const element = document.querySelector(selector);
        const check = () => {
          if (Number(element.dataset.run ?? 0) > runs) {
            observer.disconnect();
            resolve({ ...element.dataset });
          }
        };
        const observer = new MutationObserver(check);
        observer.observe(element, { attributes: true, attributeFilter: ["data-run"] });
        check();
      }),
    [readout, before]
  );
  await page.locator(start).click();
  return withTimeout(done, TIMEOUT, `${card}'s run`);
}

function withTimeout(promise, ms, what) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => (timer = setTimeout(() => reject(new Error(`${what} took over ${ms / 1000} s.`)), ms)))]).finally(() =>
    clearTimeout(timer)
  );
}

// ---- Measuring ----

/** Every combination of a case's options, as [{ picker: value }]. */
function combinations(options) {
  return Object.entries(options).reduce((all, [picker, values]) => all.flatMap((combo) => values.map((value) => ({ ...combo, [picker]: value }))), [{}]);
}

/** One repetition of a case at a size, with options, at a CPU slowdown. */
async function once(kase, size, combo, rate) {
  const { page, cdp, errors } = await open();
  try {
    await pick(page, kase.card, "size", size);
    for (const [picker, value] of Object.entries(combo)) await pick(page, kase.card, picker, value);
    await frames(page, 2);
    // The line's readout says how long it took to draw once it has.
    const drawn = kase === CASES.line ? await lineDrawn(page, size, combo.series) : undefined;
    await cdp.send("HeapProfiler.collectGarbage");
    const speed = await page.evaluate(() => {
      const began = performance.now();
      let sum = 0;
      for (let i = 0; i < 2e7; i++) sum += Math.sqrt(i);
      return sum > 0 ? performance.now() - began : 0;
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate });
    const busy = await taskMs(cdp);
    const data = await run(page, kase.card, kase.start ?? `${kase.card} [data-start]`);
    const work = (await taskMs(cdp)) - busy;
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    if (errors.length > 0) throw new Error(`The page threw: ${errors.join("; ")}`);
    const number = (name) => (data[name] === undefined ? undefined : Number(data[name]));
    return {
      frames: number("frames"),
      p95: number("p95"),
      longest: number("longest"),
      longTasks: number("longTasks"),
      longTaskMs: number("longTaskMs"),
      msPerFrame: work / Math.max(1, number("frames")),
      hoverMedian: number("hoverMedian"),
      hoverMax: number("hoverMax"),
      drawn: number("drawn") ?? drawn,
      runsStarted: number("runsStarted"),
      runsOnVisits: number("runsOnVisits"),
      runsDrawn: number("runsDrawn"),
      speed
    };
  } finally {
    await page.close();
  }
}

/** Waits for the line chart drawn at `years` and `series` to report its draw, and returns how long it took. */
async function lineDrawn(page, years, series) {
  const handle = await page.waitForFunction(
    ([y, s]) => {
      const { dataset } = document.querySelector("#line-case [data-readout]");
      return dataset.drawn !== undefined && dataset.years === String(y) && dataset.series === String(s) ? Number(dataset.drawn) : undefined;
    },
    [years, series],
    { timeout: TIMEOUT, polling: 100 }
  );
  return handle.jsonValue();
}

const median = (values) => {
  const known = values.filter((value) => typeof value === "number" && Number.isFinite(value)).sort((a, b) => a - b);
  if (known.length === 0) return undefined;
  const middle = Math.floor(known.length / 2);
  return known.length % 2 ? known[middle] : (known[middle - 1] + known[middle]) / 2;
};

/** The medians of a variant's repetitions, and whether it's smooth. */
function summarise(reps) {
  const keys = Object.keys(reps[0]);
  const medians = Object.fromEntries(keys.map((key) => [key, median(reps.map((rep) => rep[key]))]));
  const smooth = medians.p95 <= 20 && medians.longest <= 50 && (medians.hoverMax === undefined || medians.hoverMax <= 100);
  return { ...medians, smooth, smoothReps: reps.filter((rep) => rep.p95 <= 20 && rep.longest <= 50 && (rep.hoverMax === undefined || rep.hoverMax <= 100)).length };
}

/** Creates and destroys the case's chart CYCLES times, and compares the DOM counters before and after. */
async function cycles(kase) {
  const { page, cdp, errors } = await open();
  const [a, b] = kase.cycle;
  const counters = async () => {
    await frames(page, 2);
    for (let i = 0; i < 3; i++) await cdp.send("HeapProfiler.collectGarbage");
    const dom = await cdp.send("Memory.getDOMCounters");
    const heap = await cdp.send("Runtime.getHeapUsage");
    return { nodes: dom.nodes, listeners: dom.jsEventListeners, documents: dom.documents, heapMB: heap.usedSize / 1048576 };
  };
  try {
    await pick(page, kase.card, "size", a);
    const before = await counters();
    for (let i = 0; i < CYCLES; i++) {
      await pick(page, kase.card, "size", b);
      await frames(page, 1);
      await pick(page, kase.card, "size", a);
      await frames(page, 1);
    }
    // Let anything the last draws scheduled (the line's readout, a resize) finish.
    await page.waitForTimeout(500);
    const after = await counters();
    if (errors.length > 0) throw new Error(`The page threw: ${errors.join("; ")}`);
    return { before, after };
  } finally {
    await page.close();
  }
}

// ---- Running ----

const results = { machine: {}, cases: {}, cycles: {} };
const cpu = cpus()[0]?.model.trim() ?? "unknown CPU";
results.machine = {
  cpu,
  logicalCpus: cpus().length,
  memoryGB: Math.round(totalmem() / 2 ** 30),
  os: `${platform()} ${release()}`,
  browser: `Chromium ${browser.version()} (headless)`,
  affinity: args.get("affinity") ?? "none",
  reps: REPS,
  date: new Date().toISOString().slice(0, 10)
};
const started = Date.now();
const log = (text) => process.stderr.write(`[${((Date.now() - started) / 1000).toFixed(0).padStart(5)} s] ${text}\n`);

for (const name of chosen) {
  const kase = CASES[name];
  const variants = [];
  for (const combo of combinations(Object.fromEntries(Object.entries(kase.options).map(([picker, values]) => [picker, list(`${name}-${picker}`, values)])))) {
    for (const size of list(`${name}-sizes`, kase.sizes.map(String)).map(Number)) {
      const variant = { size, combo, rates: {} };
      for (const rate of RATES) {
        const reps = [];
        for (let i = 0; i < REPS; i++) {
          reps.push(await once(kase, size, combo, rate));
          log(`${name} ${size} ${JSON.stringify(combo)} ${rate}×: rep ${i + 1}/${REPS}, p95 ${reps.at(-1).p95} ms, longest ${reps.at(-1).longest} ms`);
        }
        variant.rates[rate] = { reps, ...summarise(reps) };
      }
      variants.push(variant);
    }
  }
  results.cases[name] = variants;
  if (CYCLES > 0) {
    results.cycles[name] = await cycles(kase);
    log(`${name}: ${CYCLES} create-and-destroy cycles done`);
  }
}

await browser.close();
await server?.close();

// ---- Printing ----

const fixed = (value, digits = 1) => (value === undefined ? "" : value.toFixed(digits));
const out = [];
const m = results.machine;
out.push(`# Stress benchmark, ${m.date}`, "");
out.push(`${m.cpu} (${m.logicalCpus} logical CPUs${m.affinity === "none" ? "" : `, pinned to ${m.affinity}`}), ${m.memoryGB} GB, ${m.os}; ${m.browser}, 1000 × 2000 viewport.`);
const speeds = Object.values(results.cases).flatMap((variants) => variants.flatMap((variant) => Object.values(variant.rates).flatMap((rate) => rate.reps.map((rep) => rep.speed)))).sort((a, b) => a - b);
if (speeds.length > 0) {
  const ratio = speeds[speeds.length - 1] / speeds[0];
  out.push(`Speed check: a fixed loop took ${fixed(speeds[0])} to ${fixed(speeds[speeds.length - 1])} ms (median ${fixed(median(speeds))}) before each repetition${ratio > 1.25 ? `: **${ratio.toFixed(1)}× apart, so the machine was busy with something else during this run**` : ""}.`);
}
out.push(`Medians of ${m.reps} repetitions, each on a fresh page. Times in ms; "work" is the main thread's work per frame. Smooth: 95th percentile ≤ 20 ms, longest ≤ 50 ms, and a hover shown within 100 ms.`, "");

const limits = [];
for (const name of chosen) {
  const kase = CASES[name];
  out.push(`## ${kase.title}`, "");
  const optionNames = Object.keys(kase.options);
  const extra = name === "hover" ? ["hover median", "hover max"] : name === "line" ? ["drawn", "runs started", "on visits", "drawn runs"] : name === "draw" ? ["shown after"] : [];
  const head = [kase.unit, ...optionNames, ...RATES.flatMap((rate) => [`${rate}×: p95`, "longest", "work", "long tasks", ...extra.map((e) => (rate === RATES[0] ? e : `${e}`)), "smooth"])];
  out.push(`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`);
  for (const variant of results.cases[name]) {
    const cells = [String(variant.size), ...optionNames.map((option) => variant.combo[option])];
    for (const rate of RATES) {
      const r = variant.rates[rate];
      const more =
        name === "hover"
          ? [fixed(r.hoverMedian), fixed(r.hoverMax)]
          : name === "line"
            ? [fixed(r.drawn, 0), String(r.runsStarted ?? ""), String(r.runsOnVisits ?? ""), String(r.runsDrawn ?? "")]
            : name === "draw"
              ? [fixed(r.drawn, 0)]
              : [];
      cells.push(fixed(r.p95), fixed(r.longest), fixed(r.msPerFrame, 2), `${fixed(r.longTasks, 0)} (${fixed(r.longTaskMs, 0)} ms)`, ...more, `${r.smooth ? "yes" : "no"} (${r.smoothReps}/${r.reps.length})`);
    }
    out.push(`| ${cells.join(" | ")} |`);
  }
  out.push("");
  // The largest size that's smooth, with every smaller size smooth too, for each combination of options.
  const measured = new Map(results.cases[name].map((variant) => [JSON.stringify(variant.combo), variant.combo]));
  for (const combo of measured.values()) {
    const rows = results.cases[name].filter((variant) => JSON.stringify(variant.combo) === JSON.stringify(combo)).sort((a, b) => a.size - b.size);
    const largest = (rate) => {
      let best;
      for (const variant of rows) {
        if (!variant.rates[rate].smooth) break;
        best = variant.size;
      }
      return best === undefined ? `under ${rows[0]?.size}` : String(best);
    };
    limits.push([kase.title, Object.values(combo).join(", "), ...RATES.map(largest)]);
  }
}

out.push("## Limits", "", "The largest size that's smooth, with every smaller size smooth too.", "");
out.push(`| Case | Options | ${RATES.map((rate) => `${rate}×`).join(" | ")} |`, `| --- | --- | ${RATES.map(() => "---").join(" | ")} |`);
for (const row of limits) out.push(`| ${row.join(" | ")} |`);
out.push("");

if (CYCLES > 0) {
  out.push(`## Create and destroy, ${CYCLES} times`, "", "Each case's chart drawn at its two smallest sizes in turn, after garbage collection.", "");
  out.push("| Case | Nodes before | after | Listeners before | after | Heap before (MB) | after |", "| --- | --- | --- | --- | --- | --- | --- |");
  for (const name of chosen) {
    const c = results.cycles[name];
    if (!c) continue;
    out.push(`| ${CASES[name].title} | ${c.before.nodes} | ${c.after.nodes} | ${c.before.listeners} | ${c.after.listeners} | ${fixed(c.before.heapMB)} | ${fixed(c.after.heapMB)} |`);
  }
  out.push("");
}

console.log(out.join("\n"));
if (args.has("json")) writeFileSync(args.get("json"), JSON.stringify(results, null, 2));
