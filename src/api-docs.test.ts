// @vitest-environment node
// The API reference and README (M6 decision 5), checked against the package. docs/api.md has an
// entry for every export of every entry, values and types, read from the entries themselves with
// TypeScript's compiler API, and no entry for anything else; the entries it marks as under the 0.x
// promise are CHANGELOG's. Every code example in README.md, and every example in docs/api.md (a
// block that imports the package), type-checks against the source with the repository's own
// compiler options, the page's names they use declared in PAGE below. README's links are absolute,
// since npm shows it away from the repository, and the links in both find their files and headings.
// README's pictures have alt text, and each plays once and stops within 5 s (WCAG 2.2.2).

// TypeScript 6, since 7.0's package has no compiler API.
import ts from "typescript-6";

/** Each JS entry of the package, by the name a page imports, and its source. */
const ENTRIES: Readonly<Record<string, string>> = {
  "expressive-charts": "src/index.ts",
  "expressive-charts/icons/sport": "src/icons/sport/index.ts",
  "expressive-charts/testing": "src/testing/index.ts"
};
/** The stylesheet's types, which an `import "expressive-charts/style.css"` finds (TypeScript 6 and later check it). */
const STYLESHEET = { "expressive-charts/style.css": "src/style.css.ts" };

const REPOSITORY = "https://github.com/Deaversbp/expressive-charts";
/** Where README's pictures are, as files on main. */
const RAW = "https://raw.githubusercontent.com/Deaversbp/expressive-charts/main";
/** The demo site, which publishes demo/ (.github/workflows/pages.yml). */
const SITE = "https://deaversbp.github.io/expressive-charts";

/** The line in docs/api.md that marks an entry as under the 0.x promise. */
const PROMISED = "*Under the 0.x promise.*";

/**
 * The page's own names the examples use, declared rather than defined: its rows, its elements, its
 * D3 selections and its Vega view. So an example type-checks against the real API, as a page would.
 */
const PAGE = `
interface Player { name: string; goals: number; assists: number; pos: string }
interface Outcome { outcome: string; shots: number }
interface Week { week: number; goals: number; xg: number }
interface Day { date: Date; visits: number; average: number }
interface Region { region: string; revenue: number }
/** A d3.stack() point, with its series' key copied on (.data(D => D.map(d => (d.key = D.key, d))), a common D3 idiom). */
type Stacked = import("d3-shape").SeriesPoint<Player> & { key: "goals" | "assists" };
/** A d3.pie() arc of an outcome. */
type Slice = import("d3-shape").PieArcDatum<Outcome>;
/** One D3 line path's datum: its series and its rows so far. */
interface SeriesRows { series: "goals" | "xg"; rows: { week: number; value: number }[] }
type D3Selection<E extends Element, D> = import("d3-selection").Selection<E, D, Element, unknown>;

declare const players: Player[];
declare const afterMatchweek: Player[];
declare const outcomes: Outcome[];
declare const nextMatch: Outcome[];
declare const weeks: Week[];
declare const nextWeek: Week;
declare const days: Day[];
declare const regions: Region[];
declare const nextQuarter: Region[];
/** Plot's rows, which its marks bind by index. */
declare const rows: Player[];
declare const svg: SVGSVGElement;
declare const range: HTMLInputElement;
declare const button: HTMLButtonElement;
declare const bars: D3Selection<SVGRectElement, Stacked>;
declare const slices: D3Selection<SVGPathElement, Slice>;
declare const lines: D3Selection<SVGPathElement, SeriesRows>;
/** The scales the page drew its D3 line with. */
declare const x: (week: number) => number;
declare const y: (value: number) => number;
/** The <svg>s Observable Plot drew, this time and next. */
declare const plot: SVGSVGElement & { scale(name: "x" | "y"): { apply(value: unknown): number } };
declare const nextPlot: SVGSVGElement;
declare const view: import("expressive-charts").VegaViewLike;
declare const svgMarkup: string;
declare const cspNonce: string;
`;

/** The global the script-tag bundle defines, for the scripts in README's HTML examples. */
const SCRIPT_TAG = `declare const ExpressiveCharts: typeof import("expressive-charts");`;

interface Repo {
  /** The repository's root, with forward slashes. */
  readonly root: string;
  read(path: string): string;
  bytes(path: string): Uint8Array;
  exists(path: string): boolean;
}

async function repo(): Promise<Repo> {
  // Node APIs aren't typed in this repo (the library never runs Node code), so the ones used are typed here.
  const { fileURLToPath } = (await import("node:url" as string)) as { fileURLToPath(url: URL): string };
  const { readFileSync } = (await import("node:fs" as string)) as { readFileSync(path: string): Uint8Array };
  const root = fileURLToPath(new URL("..", import.meta.url)).replace(/\\/g, "/").replace(/\/$/, "");
  return {
    root,
    read(path) {
      const text = ts.sys.readFile(`${root}/${path}`);
      if (text === undefined) throw new Error(`${path} can't be read.`);
      return text.replace(/\r\n/g, "\n");
    },
    bytes: (path) => readFileSync(`${root}/${path}`),
    exists: (path) => ts.sys.fileExists(`${root}/${path}`) || ts.sys.directoryExists(`${root}/${path}`)
  };
}

// ── Markdown ─────────────────────────────────────────────────────────────────

interface Block {
  /** The file and the line of the opening fence, 1-based. */
  readonly file: string;
  readonly line: number;
  /** The fence's language: "ts", "js", "html", "sh". */
  readonly lang: string;
  readonly code: string;
}

const FENCE = /^```([^\n`]*)\n([\s\S]*?)^```[ \t]*$/gm;

const lineAt = (text: string, index: number): number => text.slice(0, index).split("\n").length;

function blocksOf(file: string, text: string): Block[] {
  return [...text.matchAll(FENCE)].map((match) => ({
    file,
    line: lineAt(text, match.index),
    lang: match[1]!.trim().split(/\s+/)[0] ?? "",
    code: match[2]!
  }));
}

const blank = (s: string): string => s.replace(/[^\n]/g, " ");

/** The text with fenced blocks blanked out, keeping every index and line where it was. */
const unfenced = (text: string): string => text.replace(FENCE, blank);

/** The text with fenced blocks and code spans blanked out, keeping every index and line where it was. */
const prose = (text: string): string => unfenced(text).replace(/`[^`\n]+`/g, blank);

interface Heading {
  readonly level: number;
  readonly text: string;
  readonly line: number;
}

function headingsOf(text: string): Heading[] {
  const found: Heading[] = [];
  unfenced(text)
    .split("\n")
    .forEach((line, i) => {
      const match = /^(#{1,6})\s+(\S.*)$/.exec(line);
      if (match) found.push({ level: match[1]!.length, text: match[2]!.trim(), line: i + 1 });
    });
  return found;
}

/** A heading's anchor, as GitHub makes it: its text, lower case, without punctuation, spaces as hyphens. */
function slug(heading: string): string {
  const text = heading.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[`*]/g, "");
  return text.toLowerCase().replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "").replace(/ /g, "-");
}

/** Every anchor in a Markdown file: a second heading with the same anchor gets "-1", and so on. */
function anchorsOf(text: string): Set<string> {
  const seen = new Map<string, number>();
  const anchors = new Set<string>();
  for (const heading of headingsOf(text)) {
    const base = slug(heading.text);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  return anchors;
}

const anchorCache = new Map<string, Set<string>>();

/** A Markdown file's anchors, found once a file: api.md links to its own headings and architecture.md's well over a hundred times, and reading the file each time timed out under load. */
function anchorsIn(repo: Repo, path: string): Set<string> {
  let anchors = anchorCache.get(path);
  if (anchors === undefined) anchorCache.set(path, (anchors = anchorsOf(repo.read(path))));
  return anchors;
}

interface Link {
  readonly href: string;
  readonly line: number;
}

/** Markdown's links and images, and HTML's href and src. */
function linksOf(text: string): Link[] {
  return [...prose(text).matchAll(/\]\(([^)\s]+)\)|\b(?:href|src)="([^"]+)"/g)].map((match) => ({ href: (match[1] ?? match[2])!, line: lineAt(text, match.index) }));
}

/** The <img> tags outside code: where each points, and its alt text. */
function imagesOf(text: string): { readonly src: string; readonly alt: string | undefined; readonly line: number }[] {
  return [...prose(text).matchAll(/<img\b[^>]*>/g)].map((match) => ({
    src: /\bsrc="([^"]*)"/.exec(match[0])?.[1] ?? "",
    alt: /\balt="([^"]*)"/.exec(match[0])?.[1],
    line: lineAt(text, match.index)
  }));
}

/**
 * A GIF's frames' times in ms, from their graphic control extensions, and whether it loops (an
 * application extension, NETSCAPE2.0 or ANIMEXTS1.0, with a loop count).
 */
function gifTiming(gif: Uint8Array): { readonly delays: number[]; readonly loops: boolean } {
  const delays: number[] = [];
  let loops = false;
  let delay = 0;
  /** The index after the sub-blocks starting at `at`. */
  const skipBlocks = (at: number): number => {
    while (gif[at]! !== 0) at += gif[at]! + 1;
    return at + 1;
  };
  const table = (packed: number): number => (packed & 0x80 ? 3 * 2 ** ((packed & 7) + 1) : 0);
  let at = 13 + table(gif[10]!);
  while (at < gif.length) {
    const block = gif[at]!;
    if (block === 0x3b) break;
    if (block === 0x21 && gif[at + 1] === 0xf9) {
      delay = (gif[at + 4]! | (gif[at + 5]! << 8)) * 10;
      at = skipBlocks(at + 2);
    } else if (block === 0x21 && gif[at + 1] === 0xff) {
      const id = String.fromCharCode(...gif.subarray(at + 3, at + 14));
      loops ||= id === "NETSCAPE2.0" || id === "ANIMEXTS1.0";
      at = skipBlocks(at + 2);
    } else if (block === 0x21) {
      at = skipBlocks(at + 2);
    } else if (block === 0x2c) {
      delays.push(delay);
      delay = 0;
      at = skipBlocks(at + 10 + table(gif[at + 9]!) + 1);
    } else {
      throw new Error(`Not a GIF block: 0x${block.toString(16)} at byte ${at}.`);
    }
  }
  return { delays, loops };
}

// ── docs/api.md's entries ────────────────────────────────────────────────────

interface Section {
  /** Each name documented, and the line of its heading. */
  readonly names: Map<string, number>;
  /** Names documented twice. */
  readonly twice: string[];
  /** Names whose entry says it's under the 0.x promise. */
  readonly promised: Set<string>;
}

/**
 * The entry sections of docs/api.md: each `## ` heading that's a code span is an entry of the
 * package, and each heading under it that starts with a code span documents the names its code
 * spans give (`barChart()` is barChart). Other headings group them.
 */
function sectionsOf(text: string): Map<string, Section> {
  const sections = new Map<string, Section>();
  const lines = text.split("\n");
  const headings = new Map(headingsOf(text).map((h) => [h.line, h]));
  let section: Section | undefined;
  let entry: string[] = [];
  lines.forEach((line, i) => {
    const heading = headings.get(i + 1);
    if (heading && heading.level <= 2) {
      const name = /^`([^`]+)`$/.exec(heading.text)?.[1];
      section = name === undefined ? undefined : { names: new Map(), twice: [], promised: new Set() };
      if (name !== undefined && section) sections.set(name, section);
      entry = [];
    } else if (heading && section) {
      entry = heading.text.startsWith("`") ? [...heading.text.matchAll(/`([^`]+)`/g)].map((m) => m[1]!.split(/[(<]/)[0]!.trim()) : [];
      for (const name of entry) {
        if (section.names.has(name)) section.twice.push(name);
        else section.names.set(name, heading.line);
      }
    } else if (line.trim() === PROMISED && section) {
      for (const name of entry) section.promised.add(name);
    }
  });
  return sections;
}

/** CHANGELOG's promised names, as src/promise.test.ts reads them, each member (`describe.bar`) as its export. */
function promisedNames(changelog: string): string[] {
  const start = changelog.indexOf("## The 0.x promise");
  const end = changelog.indexOf("From 0.1.0:", start);
  if (start < 0 || end < 0) throw new Error('CHANGELOG.md has no "## The 0.x promise" section ending at "From 0.1.0:".');
  const spans = [...changelog.slice(start, end).matchAll(/`([^`]+)`/g)].map((match) => match[1]!);
  return unique(spans.filter((span) => /^[A-Za-z]\w*(\.\w+)?$/.test(span)).map((span) => span.split(".")[0]!));
}

const unique = (names: readonly string[]): string[] => [...new Set(names)].sort();

// ── The compiler ─────────────────────────────────────────────────────────────

interface Example {
  readonly block: Block;
  /** The code compiled, and the Markdown line its first line is on. */
  readonly code: string;
  readonly first: number;
  /** Its own name in the program. */
  readonly path: string;
}

interface Compiled {
  readonly program: ts.Program;
  /** Each entry's exports, by name. */
  readonly exports: ReadonlyMap<string, readonly string[]>;
  /** What's wrong with an example: "README.md:42: …" for each diagnostic. */
  problems(examples: readonly Example[]): string[];
}

/**
 * One program over the entries and every example, with the repository's compiler options, as
 * `npm run typecheck` reads them, and the package's names pointing at its source.
 */
function compile(repo: Repo, examples: readonly Example[]): Compiled {
  const config = ts.readConfigFile(`${repo.root}/tsconfig.json`, ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
  const paths = Object.fromEntries(Object.entries({ ...ENTRIES, ...STYLESHEET }).map(([name, source]) => [name, [`./${source}`]]));
  const json = { ...config.config, compilerOptions: { ...config.config.compilerOptions, types: [], noEmit: true, moduleDetection: "force", paths } };
  const { options } = ts.parseJsonConfigFileContent(json, ts.sys, repo.root, undefined, `${repo.root}/tsconfig.json`);

  // The page's names are globals, in a module of their own so they're checked too (skipLibCheck skips a .d.ts).
  const page = `export {};\ndeclare global {${(PAGE + SCRIPT_TAG).replace(/^declare /gm, "")}\n}\n`;
  const virtual = new Map<string, string>([[`${repo.root}/__page__.ts`, page]]);
  for (const example of examples) virtual.set(example.path, example.code);
  const host = ts.createCompilerHost(options);
  const { getSourceFile, fileExists, readFile } = host;
  host.getSourceFile = (name, language, ...rest) => {
    const code = virtual.get(name);
    return code === undefined ? getSourceFile.call(host, name, language, ...rest) : ts.createSourceFile(name, code, language);
  };
  host.fileExists = (name) => virtual.has(name) || fileExists.call(host, name);
  host.readFile = (name) => virtual.get(name) ?? readFile.call(host, name);

  const program = ts.createProgram([...Object.values(ENTRIES).map((source) => `${repo.root}/${source}`), ...virtual.keys()], options, host);
  const checker = program.getTypeChecker();
  const exports = new Map(
    Object.entries(ENTRIES).map(([name, source]) => {
      const file = program.getSourceFile(`${repo.root}/${source}`);
      const module = file && checker.getSymbolAtLocation(file);
      if (!module) throw new Error(`${source} isn't a module.`);
      return [name, checker.getExportsOfModule(module).map((symbol) => symbol.name)] as const;
    })
  );

  return {
    program,
    exports,
    problems(list) {
      const page = program.getSourceFile(`${repo.root}/__page__.ts`)!;
      const found = [...program.getOptionsDiagnostics(), ...program.getGlobalDiagnostics(), ...program.getSyntacticDiagnostics(page), ...program.getSemanticDiagnostics(page)].map(
        (d) => `PAGE: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`
      );
      for (const example of list) {
        const file = program.getSourceFile(example.path)!;
        for (const d of [...program.getSyntacticDiagnostics(file), ...program.getSemanticDiagnostics(file)]) {
          const line = d.start === undefined ? 0 : file.getLineAndCharacterOfPosition(d.start).line;
          found.push(`${example.block.file}:${example.first + line}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`);
        }
      }
      return found;
    }
  };
}

/** README's code examples: every `ts` and `js` block, and the scripts in its HTML. */
function readmeExamples(repo: Repo, blocks: readonly Block[]): Example[] {
  const examples: Example[] = [];
  for (const block of blocks) {
    const path = `${repo.root}/README.md.${block.line}.ts`;
    if (block.lang === "ts" || block.lang === "js") examples.push({ block, code: block.code, first: block.line + 1, path });
    if (block.lang === "html") {
      for (const script of block.code.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
        const start = script.index + "<script>".length;
        examples.push({ block, code: script[1]!, first: block.line + lineAt(block.code, start), path: `${path.slice(0, -3)}.${start}.ts` });
      }
    }
  }
  return examples;
}

/** docs/api.md's examples: its `ts` and `js` blocks that import the package. The others are signatures. */
function apiExamples(repo: Repo, blocks: readonly Block[]): Example[] {
  return blocks
    .filter((block) => (block.lang === "ts" || block.lang === "js") && /from "expressive-charts/.test(block.code))
    .map((block) => ({ block, code: block.code, first: block.line + 1, path: `${repo.root}/docs/api.md.${block.line}.ts` }));
}

// ── Links ────────────────────────────────────────────────────────────────────

/**
 * What's wrong with a file's links: a link into the repository (relative, to its files on GitHub or
 * raw.githubusercontent.com, or to a page of the demo site) must find its file, and a heading's anchor
 * in a Markdown file. With `absolute`, every link must be absolute or an anchor in the same file.
 */
function brokenLinks(repo: Repo, file: string, text: string, absolute: boolean): string[] {
  const problems: string[] = [];
  const escape = (url: string): string => url.replace(/[.]/g, "\\.");
  const blob = new RegExp(`^${escape(REPOSITORY)}/(?:blob|tree)/main/([^#?]*)(?:#(.*))?$`);
  const raw = new RegExp(`^${escape(RAW)}/([^#?]+)$`);
  const site = new RegExp(`^${escape(SITE)}/([^#?]*)$`);
  const dir = file.includes("/") ? file.slice(0, file.lastIndexOf("/") + 1) : "";
  for (const { href, line } of linksOf(text)) {
    const at = `${file}:${line}: ${href}`;
    let target: string | undefined;
    let anchor: string | undefined;
    if (href.startsWith("#")) {
      target = file;
      anchor = href.slice(1);
    } else if (/^[a-z]+:/i.test(href)) {
      const match = blob.exec(href) ?? raw.exec(href);
      const page = site.exec(href);
      if (page) {
        target = `demo/${decodeURI(page[1]!) || "index.html"}`;
        if (!target.endsWith(".html")) problems.push(`${at} isn't a page of the demo site`);
      } else if (match) {
        target = decodeURI(match[1]!).replace(/\/$/, "");
        anchor = match[2];
      } else {
        continue;
      }
    } else if (absolute) {
      problems.push(`${at} is relative: npm can't follow it, so link to ${REPOSITORY}/blob/main/…`);
      continue;
    } else {
      const [path = "", hash] = href.split("#");
      target = normalise(dir + decodeURI(path));
      anchor = hash;
    }
    if (target === "" ? false : !repo.exists(target)) {
      problems.push(`${at}: there's no ${target}`);
      continue;
    }
    if (anchor !== undefined && target.endsWith(".md") && !anchorsIn(repo, target).has(anchor)) {
      problems.push(`${at}: ${target} has no heading #${anchor}`);
    }
  }
  return problems;
}

/** A path with its "." and ".." steps resolved. */
function normalise(path: string): string {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== "." && part !== "") parts.push(part);
  }
  return parts.join("/");
}

// ── The tests ────────────────────────────────────────────────────────────────

let root: Repo;
let readme: string;
let api: string;
let examples: { readonly readme: Example[]; readonly api: Example[] };
let compiled: Compiled;

beforeAll(async () => {
  root = await repo();
  readme = root.read("README.md");
  api = root.read("docs/api.md");
  examples = { readme: readmeExamples(root, blocksOf("README.md", readme)), api: apiExamples(root, blocksOf("docs/api.md", api)) };
  compiled = compile(root, [...examples.readme, ...examples.api]);
}, 120_000);

describe("docs/api.md", () => {
  it("has a section for each entry in package.json's exports", () => {
    const pkg = JSON.parse(root.read("package.json")) as { name: string; exports: Record<string, unknown> };
    const entries = Object.keys(pkg.exports).map((key) => pkg.name + key.slice(1));
    expect(entries.filter((name) => !name.endsWith(".css")).sort(), "the JS entries this test reads").toEqual(Object.keys(ENTRIES).sort());
    expect([...sectionsOf(api).keys()].sort()).toEqual(entries.sort());
  });

  it("documents every export of every entry, values and types, and nothing else", () => {
    const sections = sectionsOf(api);
    for (const [entry, exported] of compiled.exports) {
      const section = sections.get(entry);
      const documented = [...(section?.names.keys() ?? [])];
      expect(
        { missing: exported.filter((name) => !documented.includes(name)).sort(), notExported: documented.filter((name) => !exported.includes(name)).sort(), twice: section?.twice ?? [] },
        entry
      ).toEqual({ missing: [], notExported: [], twice: [] });
    }
    expect(sections.get("expressive-charts/style.css")?.names.size, "style.css exports no names").toBe(0);
  });

  it("marks exactly the names the 0.x promise covers", () => {
    const marked = unique([...sectionsOf(api).values()].flatMap((section) => [...section.promised]));
    expect(marked).toEqual(promisedNames(root.read("CHANGELOG.md")));
  });

  it("has examples that type-check against the package", () => {
    expect(examples.api.length).toBeGreaterThan(0);
    expect(compiled.problems(examples.api)).toEqual([]);
  });

  it("has links that find their files and headings", () => {
    expect(brokenLinks(root, "docs/api.md", api, false)).toEqual([]);
  });
});

describe("README.md", () => {
  it("has code examples that type-check against the package", () => {
    expect(examples.readme.length).toBeGreaterThan(0);
    expect(compiled.problems(examples.readme)).toEqual([]);
  });

  it("only has examples a test checks: TypeScript or JavaScript, HTML with a script, or shell commands", () => {
    const blocks = blocksOf("README.md", readme);
    expect(blocks.filter((block) => !["ts", "js", "html", "sh"].includes(block.lang)).map((block) => `README.md:${block.line}: ${block.lang || "(no language)"}`)).toEqual([]);
  });

  it("installs the package by its name, and loads the script-tag bundle by its global", () => {
    const pkg = JSON.parse(root.read("package.json")) as { name: string; files: string[] };
    const blocks = blocksOf("README.md", readme);
    expect(blocks.some((block) => block.lang === "sh" && block.code.includes(`npm install ${pkg.name}\n`))).toBe(true);
    const html = blocks.filter((block) => block.lang === "html").map((block) => block.code).join("\n");
    expect(html).toMatch(new RegExp(`<script src="[^"]*/${pkg.name}@[^/"]+/dist/expressive-charts\\.global\\.js"></script>`));
    expect(pkg.files).toContain("dist");
    expect(root.read("tsdown.config.ts")).toContain('globalName: "ExpressiveCharts"');
  });

  it("has absolute links, which find their files and headings", () => {
    expect(brokenLinks(root, "README.md", readme, true)).toEqual([]);
  });

  it("has pictures in docs/media with alt text, under 1 MB, each GIF playing once and stopping within 5 s", () => {
    const images = imagesOf(readme);
    expect(images.length).toBeGreaterThan(0);
    for (const { src, alt, line } of images) {
      const at = `README.md:${line}: ${src}`;
      expect(alt?.trim(), `${at} has no alt text`).toBeTruthy();
      expect(src.startsWith(`${RAW}/docs/media/`), `${at} isn't in docs/media`).toBe(true);
      // A GIF's time can be read here; other animated formats (WebP, APNG) would go unchecked.
      expect(src, `${at} is a GIF or a still`).toMatch(/\.(gif|png|jpe?g)$/);
      const path = src.slice(RAW.length + 1);
      const bytes = root.bytes(path);
      expect(bytes.length, `${at} is over 1 MB`).toBeLessThanOrEqual(1024 * 1024);
      if (!path.endsWith(".gif")) continue;
      // WCAG 2.2.2: npm can't pause a picture, so it must stop by itself. The last frame stays.
      const { delays, loops } = gifTiming(bytes);
      expect(loops, `${at} loops`).toBe(false);
      expect(delays.slice(0, -1).reduce((sum, ms) => sum + ms, 0), `${at} plays for more than 5 s`).toBeLessThanOrEqual(5000);
    }
  });
});
