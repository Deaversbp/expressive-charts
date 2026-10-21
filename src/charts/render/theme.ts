// Theme tokens: `--ec-*` CSS custom properties with light and dark defaults, and the small stylesheet
// every chart shares. The stylesheet sets the defaults on the root element, following
// prefers-color-scheme, and on any element with data-theme="light" or "dark". Hosts theme a chart by
// setting the custom properties; every default rule uses :where(), so host CSS overrides it without
// specificity fights. The same text is injected as a <style> and shipped as dist/expressive-charts.css.

import type { Color } from "../../core";

/** Palette slots run 1–8 and wrap after that. */
export const PALETTE_SIZE = 8;

/** A theme's default token values. */
export interface Theme {
  readonly surface: string;
  readonly text: string;
  readonly "text-muted": string;
  readonly grid: string;
  readonly axis: string;
  readonly focus: string;
  readonly negative: string;
  /** Hairline borders on controls and the tooltip. */
  readonly ring: string;
  /** Opacity of the other marks while one is hovered: a number, not a colour. */
  readonly "dim-opacity": string;
  /** Slots 1–8: the mark colour, and its -strong variant for hover emphasis. */
  readonly series: readonly (readonly [color: string, strong: string])[];
}

/**
 * The defaults, validated in theme.test.ts: every mark colour has at least 3:1 contrast against the
 * surface, neighbouring slots stay apart under protanopia, deuteranopia and tritanopia, and each
 * -strong variant is its colour stepped toward the text colour. Slots 1–4 are the prototype's, except
 * that light 3 and 4 are darkened just enough to reach 3:1.
 */
export const themes: { readonly light: Theme; readonly dark: Theme } = {
  light: {
    surface: "#fcfcfb",
    text: "#0b0b0b",
    "text-muted": "#75736d",
    grid: "#e1e0d9",
    axis: "#c3c2b7",
    focus: "#2a78d6",
    negative: "#d03b3b",
    ring: "rgba(11, 11, 11, 0.1)",
    "dim-opacity": "0.3",
    series: [
      ["#2a78d6", "#1c5cab"],
      ["#eb6834", "#c24d1d"],
      ["#02a471", "#07835a"],
      ["#c28409", "#9d6a07"],
      ["#8966da", "#6e49ba"],
      ["#0096b0", "#05778c"],
      ["#7a8a05", "#606d03"],
      ["#c34e97", "#a32f7a"]
    ]
  },
  dark: {
    surface: "#1a1a19",
    text: "#f0efec",
    "text-muted": "#8f8d86",
    grid: "#2c2c2a",
    axis: "#45453f",
    focus: "#3987e5",
    negative: "#e66767",
    ring: "rgba(255, 255, 255, 0.1)",
    // Dimmed marks keep about the contrast they have in light (1.5:1 against 1.4:1 on average).
    "dim-opacity": "0.3",
    series: [
      ["#3987e5", "#6da7ec"],
      ["#d95926", "#fb7747"],
      ["#199e70", "#45bc8c"],
      ["#c98500", "#eda100"],
      ["#936fe4", "#af8ffe"],
      ["#0b99b3", "#40b7d2"],
      ["#829401", "#9eb237"],
      ["#c8529c", "#e970ba"]
    ]
  }
};

/** The colour tokens a drawing can name, besides the series. */
const COLOR_TOKENS = ["surface", "text", "text-muted", "grid", "axis", "focus", "negative"] as const;
type ColorToken = (typeof COLOR_TOKENS)[number];

/** Light's colour tokens: the fallbacks in rules and inline styles, for a page that sets some tokens but has no stylesheet. */
const TOKENS: Readonly<Record<string, string>> = Object.fromEntries(COLOR_TOKENS.map((name) => [name, themes.light[name]])) as Record<ColorToken, string>;

/** A series' colours as CSS: the mark colour and the stronger one used for hover emphasis. */
export interface SeriesColors {
  readonly color: string;
  readonly strong: string;
}

/** The CSS colours for a palette slot (1-based; wraps after PALETTE_SIZE), with light's as fallbacks. */
export function seriesColors(slot: number): SeriesColors {
  const n = ((Math.max(1, Math.floor(slot)) - 1) % PALETTE_SIZE) + 1;
  const [color, strong] = themes.light.series[n - 1]!;
  return { color: `var(--ec-series-${n}, ${color})`, strong: `var(--ec-series-${n}-strong, ${strong})` };
}

/**
 * A drawing-API colour as CSS. Theme tokens become custom properties with fallbacks; "mark" and
 * "mark-strong" are the colours of the mark a run belongs to (set on its overlay group as --ec-mark);
 * anything else passes through as a CSS colour.
 */
export function cssColor(color: Color): string {
  if (color === "mark") return `var(--ec-mark, ${seriesColors(1).color})`;
  if (color === "mark-strong") return `var(--ec-mark-strong, ${seriesColors(1).strong})`;
  const fallback = TOKENS[color];
  if (fallback !== undefined) return `var(--ec-${color}, ${fallback})`;
  const series = /^series-(\d+)(-strong)?$/.exec(color);
  if (series) {
    const colors = seriesColors(Number(series[1]));
    return series[2] ? colors.strong : colors.color;
  }
  return color;
}

/** Sets --ec-mark and --ec-mark-strong, which the stylesheet and the "mark" token read. */
export function markColorStyles(colors: SeriesColors | undefined): Record<string, string | undefined> {
  return { "--ec-mark": colors?.color, "--ec-mark-strong": colors?.strong };
}

/** A theme as custom property declarations, one per line. */
function declarations(theme: Theme, indent: string): string {
  const names = [...COLOR_TOKENS, "ring", "dim-opacity"] as const;
  const lines = names.map((name) => `--ec-${name}: ${theme[name]};`);
  theme.series.forEach(([color, strong], i) => lines.push(`--ec-series-${i + 1}: ${color};`, `--ec-series-${i + 1}-strong: ${strong};`));
  return lines.map((line) => indent + line).join("\n");
}

/**
 * The tokens: light on the root and on data-theme="light"; dark when the device prefers it, unless the
 * root says data-theme="light"; dark on data-theme="dark". In that order, so data-theme on any element
 * sets its subtree's theme. :where() keeps all of it at zero specificity.
 */
const TOKEN_RULES = `:where(:root, [data-theme="light"]) {
${declarations(themes.light, "  ")}
}
@media (prefers-color-scheme: dark) {
  :where(:root:not([data-theme="light"])) {
${declarations(themes.dark, "    ")}
  }
}
:where([data-theme="dark"]) {
${declarations(themes.dark, "  ")}
}`;

const STYLES = `/* expressive-charts: theme tokens and default styles. Every rule has zero specificity, so your CSS wins. */
${TOKEN_RULES}
:where(.ec-chart) { display: block; max-width: 100%; height: auto; overflow: visible; touch-action: pan-y; -webkit-tap-highlight-color: transparent; }
:where(.ec-chart text) { font-variant-numeric: tabular-nums; }
:where(.ec-chart .ec-gridline) { stroke: var(--ec-grid, ${TOKENS.grid}); stroke-width: 1; }
:where(.ec-chart .ec-baseline) { stroke: var(--ec-axis, ${TOKENS.axis}); stroke-width: 1; }
:where(.ec-chart .ec-tick) { fill: var(--ec-text-muted, ${TOKENS["text-muted"]}); font-size: 11px; }
:where(.ec-chart .ec-label) { fill: var(--ec-text, ${TOKENS.text}); font-size: 12.5px; }
:where(.ec-chart .ec-value, .ec-chart .ec-text) { fill: var(--ec-text, ${TOKENS.text}); font-size: 12.5px; font-weight: 600; }
:where(.ec-chart .ec-hit) { fill: transparent; }
:where(.ec-chart .ec-mark:focus) { outline: none; }
:where(.ec-chart .ec-focus) { pointer-events: none; }
:where(.ec-chart .ec-focus-ring) { fill: none; stroke: var(--ec-focus, ${TOKENS.focus}); }
:where(.ec-chart .ec-focus-gap) { fill: var(--ec-surface, ${TOKENS.surface}); stroke: var(--ec-surface, ${TOKENS.surface}); }
:where(.ec-chart .ec-mark) { transition: opacity var(--ec-hover-duration, 100ms) ease-out; }
:where(.ec-chart .ec-segment) { fill: var(--ec-mark); transition: fill var(--ec-hover-duration, 100ms) ease-out; }
:where(.ec-chart .ec-hot .ec-segment) { fill: var(--ec-mark-strong); }
:where(.ec-chart.ec-hovering .ec-mark:not(.ec-hot)) { opacity: var(--ec-dim-opacity, 0.3); }
:where(.ec-motion-switch) { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; color: var(--ec-text, ${TOKENS.text}); font-size: 13px; }
:where(.ec-motion-label) { font-weight: 600; }
:where(.ec-motion-modes) { display: inline-flex; gap: 2px; padding: 2px; border: 1px solid var(--ec-ring, color-mix(in srgb, currentColor 12%, transparent)); border-radius: 8px; background: var(--ec-surface, ${TOKENS.surface}); }
:where(.ec-motion-modes button) { font: inherit; color: inherit; border: 0; background: transparent; padding: 5px 10px; border-radius: 6px; cursor: pointer; }
:where(.ec-motion-modes button:hover, .ec-motion-modes button[aria-pressed="true"]) { background: color-mix(in srgb, var(--ec-focus, ${TOKENS.focus}) 12%, transparent); }
:where(.ec-motion-modes button[aria-pressed="true"]) { font-weight: 600; }
:where(.ec-motion-modes button:focus-visible) { outline: 2px solid var(--ec-focus, ${TOKENS.focus}); outline-offset: 2px; }
:where(.ec-motion-hint) { flex: 1 1 220px; min-width: 0; color: var(--ec-text-muted, ${TOKENS["text-muted"]}); }
:where(.ec-chart .ec-leaving, .ec-chart .ec-overlay) { pointer-events: none; }
:where(.ec-attached.ec-dimmed) { opacity: var(--ec-dim-opacity, 0.3); }
:where(.ec-attached) { transition: opacity var(--ec-hover-duration, 100ms) ease-out; }
:where(.ec-tooltip-layer) { position: relative; height: 0; }
:where(.ec-tooltip) { position: absolute; left: 0; top: 0; z-index: 3; box-sizing: border-box; width: max-content; max-width: 24em; padding: 8px 10px; border: 1px solid var(--ec-ring, color-mix(in srgb, currentColor 12%, transparent)); border-radius: 8px; background: var(--ec-surface, ${TOKENS.surface}); color: var(--ec-text, ${TOKENS.text}); box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12); font-size: 13px; line-height: 1.35; white-space: pre-line; font-variant-numeric: tabular-nums; pointer-events: none; opacity: 0; visibility: hidden; transition: opacity var(--ec-hover-duration, 100ms) ease-out, visibility 0s linear var(--ec-hover-duration, 100ms); }
:where(.ec-tooltip.ec-tooltip-shown) { opacity: 1; visibility: visible; transition: opacity var(--ec-hover-duration, 100ms) ease-out; }
:where(.ec-tooltip-title) { font-weight: 600; }
:where(.ec-legend) { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-bottom: 8px; font-size: 13px; line-height: 1.4; color: var(--ec-text, ${TOKENS.text}); }
:where(.ec-legend-item) { display: inline-flex; align-items: center; gap: 6px; }
:where(.ec-legend-swatch) { flex: none; width: 10px; height: 10px; border-radius: 3px; background: var(--ec-mark); forced-color-adjust: none; }
`;

const MARKER = "data-expressive-charts";

/** The stylesheet's text: what's injected, and what the build writes to dist/expressive-charts.css. */
export const stylesheet = STYLES;

/** How the stylesheet reaches the page. */
export interface StyleOptions {
  /** Set on the injected `<style>`, for a Content-Security-Policy that allows styles by nonce. */
  readonly nonce?: string | undefined;
  /** false: inject nothing; the page loads expressive-charts/style.css itself. Default true. */
  readonly injectStyles?: boolean | undefined;
}

/**
 * Page-wide, like the stylesheet itself, which is injected once per document by whatever is created
 * first (a chart, an adapter, a control). Set with configure().
 */
export const styleOptions: { nonce?: string | undefined; injectStyles?: boolean | undefined } = {};

/** Adds the shared stylesheet to the document once, unless the page loads it itself. */
export function injectStyles(doc: Document): void {
  if (styleOptions.injectStyles === false || doc.querySelector(`style[${MARKER}]`)) return;
  const style = doc.createElement("style");
  style.setAttribute(MARKER, "");
  // Before the element is connected: CSP checks the nonce when the stylesheet is created.
  if (styleOptions.nonce) style.setAttribute("nonce", styleOptions.nonce);
  style.textContent = STYLES;
  (doc.head ?? doc.documentElement).appendChild(style);
}
