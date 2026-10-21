// Theme tokens: `--ec-*` CSS custom properties, with the prototype's light palette as fallbacks, and the
// small stylesheet every chart shares. Hosts theme a chart by setting the custom properties; the
// default rules use :where(), so host CSS overrides them without specificity fights.

import type { Color } from "../../core";

/** Palette slots run 1–8 and wrap after that. */
export const PALETTE_SIZE = 8;

/** Fallbacks for --ec-series-N and --ec-series-N-strong. 1–4 are the prototype's; all eight are validated for contrast in M2. */
const SERIES: readonly (readonly [color: string, strong: string])[] = [
  ["#2a78d6", "#1c5cab"],
  ["#eb6834", "#c24d1d"],
  ["#1baf7a", "#138a5f"],
  ["#eda100", "#c98500"],
  ["#8a5cd6", "#6c40b8"],
  ["#1a9fb8", "#137c90"],
  ["#d6457f", "#b22d62"],
  ["#8c7a5b", "#6b5c43"]
];

/** Fallbacks for the other tokens. */
const TOKENS: Readonly<Record<string, string>> = {
  surface: "#fcfcfb",
  text: "#0b0b0b",
  "text-muted": "#7d7b75",
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  focus: "#2a78d6",
  negative: "#d03b3b"
};

/** A series' colours as CSS: the mark colour and the stronger one used for hover emphasis. */
export interface SeriesColors {
  readonly color: string;
  readonly strong: string;
}

/** The CSS colours for a palette slot (1-based; wraps after PALETTE_SIZE). */
export function seriesColors(slot: number): SeriesColors {
  const n = ((Math.max(1, Math.floor(slot)) - 1) % PALETTE_SIZE) + 1;
  const [color, strong] = SERIES[n - 1]!;
  return { color: `var(--ec-series-${n}, ${color})`, strong: `var(--ec-series-${n}-strong, ${strong})` };
}

/**
 * A drawing-API colour as CSS. Theme tokens become custom properties with fallbacks; "mark" and
 * "mark-strong" are the colours of the mark a run belongs to (set on its overlay group as --ec-mark);
 * anything else passes through as a CSS colour.
 */
export function cssColor(color: Color): string {
  if (color === "mark") return "var(--ec-mark, var(--ec-series-1, #2a78d6))";
  if (color === "mark-strong") return "var(--ec-mark-strong, var(--ec-series-1-strong, #1c5cab))";
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

const STYLES = `
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

/** Adds the shared stylesheet to the document once. */
export function injectStyles(doc: Document): void {
  if (doc.querySelector(`style[${MARKER}]`)) return;
  const style = doc.createElement("style");
  style.setAttribute(MARKER, "");
  style.textContent = STYLES;
  (doc.head ?? doc.documentElement).appendChild(style);
}
