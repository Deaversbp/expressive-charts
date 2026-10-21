// Page-wide settings. For now they say how the stylesheet reaches the page. The stylesheet is one
// <style> per document, injected by whatever is created first (a chart, an adapter, a control), so
// these can't be chart options: a nonce passed to one chart would only count if that chart came
// first, and one chart's injectStyles: false couldn't stop the next one injecting. A CSP nonce is per
// page response anyway, so it's set once.

import { styleOptions, type StyleOptions } from "./charts";

/**
 * Sets how charts, adapters and controls get their stylesheet, page-wide. Call it before creating
 * any: the stylesheet is injected once, by the first one. Options left out keep their current value.
 *
 * - `nonce`: set on the injected `<style>`, for a Content-Security-Policy with a `style-src` nonce.
 * - `injectStyles: false`: inject nothing; the page loads `expressive-charts/style.css` itself, which
 *   has the same rules. For a CSP that allows no inline styles at all.
 */
export function configure(options: StyleOptions): void {
  if (typeof options !== "object" || options === null) throw new TypeError("configure needs an options object.");
  if ("nonce" in options) {
    if (options.nonce !== undefined && (typeof options.nonce !== "string" || options.nonce === "")) {
      throw new TypeError("configure: nonce must be a non-empty string.");
    }
    styleOptions.nonce = options.nonce;
  }
  if ("injectStyles" in options) {
    if (options.injectStyles !== undefined && typeof options.injectStyles !== "boolean") {
      throw new TypeError("configure: injectStyles must be true or false.");
    }
    styleOptions.injectStyles = options.injectStyles;
  }
}
