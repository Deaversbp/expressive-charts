# expressive-charts

Composable motion and expressive effects for web charts. Hover, update and morph animations that work on bar, line and donut charts, including SVG charts you've already built with D3 or Observable Plot, and Vega or Vega-Lite charts rendered as SVG. Presentation, analysis and reduced-motion modes are built in.

<table>
  <tr>
    <td width="50%" valign="top"><a href="https://deaversbp.github.io/expressive-charts/bars.html"><img src="https://raw.githubusercontent.com/Deaversbp/expressive-charts/main/docs/media/arrow-on-hover.gif" width="100%" alt="A bar chart of revenue by region. The pointer moves onto North's bar, the other bars dim, and an arrow runs along it to its end. Then the same on East's bar."></a><br><code>travel(icons.arrow)</code> on hover, from the <a href="#quick-start">quick start</a></td>
    <td width="50%" valign="top"><a href="https://deaversbp.github.io/expressive-charts/bars.html"><img src="https://raw.githubusercontent.com/Deaversbp/expressive-charts/main/docs/media/ball-and-boot.gif" width="100%" alt="Stacked bars of goals and assists by player. On Tanaka's bar a ball rolls along the goals and a boot steps along the assists, then the same on Lindqvist's."></a><br>A <code>sequence</code> of two <code>travel</code>s on stacked bars</td>
  </tr>
  <tr>
    <td width="50%" valign="top"><a href="https://deaversbp.github.io/expressive-charts/line.html"><img src="https://raw.githubusercontent.com/Deaversbp/expressive-charts/main/docs/media/threshold-line.gif" width="100%" alt="A line chart of goals against expected goals. Play is pressed and the season draws week by week: the goals line is red wherever it's below the dashed xG line, and a ball rides its tip."></a><br><code>threshold</code> and a riding <code>travel</code>, played by <code>playback()</code></td>
    <td width="50%" valign="top"><a href="https://deaversbp.github.io/expressive-charts/morph.html"><img src="https://raw.githubusercontent.com/Deaversbp/expressive-charts/main/docs/media/donut-to-columns.gif" width="100%" alt="A donut chart of shot outcomes. Show as columns is clicked, and each slice morphs into its own column, keeping its colour."></a><br><code>chartSwitch</code> and <code>morph()</code>, from a donut to columns</td>
  </tr>
</table>

Each picture plays once and stops where its effect ends. **[The demo site](https://deaversbp.github.io/expressive-charts/)** has every effect to try, on the library's charts and on D3, Vega-Lite and hand-written ones, with the motion modes and reduced motion.

> **Status: 0.4.0 (October 2026).** The effect-author API is under [the 0.x promise](#the-0x-promise); the charts, adapters, built-in effects and motion core can still change in a minor release. [CHANGELOG.md](https://github.com/Deaversbp/expressive-charts/blob/main/CHANGELOG.md#040-27-october-2026) lists what's new and what changed since 0.3.0.

- **Effects first.** The mark effects `travel`, `flash`, `wiggle`, `pulse`, `trace` and the data effects `threshold`, `delta` and `label`, put together with `sequence`, `parallel`, `only` and `stagger`; and the transition effect `morph`, which `chartSwitch` plays to turn each mark of one chart into its mark in the next (a transition can't go into a combinator). An effect reads only a shared description of the mark, so one effect works on every chart, and effects of your own work everywhere the built-in ones do.
- **Charts and adapters.** Bar, donut and line charts, a switch that morphs one into another, adapters that bring the same effects to SVG marks drawn by other code, and hover linked across them.
- **Motion that stays readable.** One clock and three modes: Presentation (staged, about a second), Analysis (at most about 200 ms) and Off. The device's reduced-motion setting is followed unless the viewer picks a mode on the page, and every effect has an end state, which is what reduced motion shows.
- **Accessible.** Keyboard focus, a name for every mark, a data table, announcements and a pause control for anything that plays, checked against WCAG 2.2 AA.

## Install

```sh
npm install expressive-charts
```

It has no runtime dependencies. It's an ES module and CommonJS, each with its own types, and its JavaScript has no side effects, so a bundler keeps only what a page imports: a bar chart is about 30 KB gzipped, and everything 76 KB.

On a page with no bundler, the script-tag bundle defines one global, `ExpressiveCharts`, holding the main entry:

```html
<div id="sales"></div>
<script src="https://cdn.jsdelivr.net/npm/expressive-charts@0.4/dist/expressive-charts.global.js"></script>
<script>
  const { barChart } = ExpressiveCharts;
  barChart("#sales", {
    label: "Revenue by region",
    data: [{ region: "North", revenue: 42 }, { region: "South", revenue: 35 }],
    y: "region",
    x: "revenue",
    on: { hover: "wiggle" }
  });
</script>
```

## Quick start

A bar chart where an arrow runs out a bar on hover, and the bars an update changes blink:

```js
import { barChart, icons, travel } from "expressive-charts";

const chart = barChart("#sales", {
  label: "Revenue by region",            // the chart's accessible name
  data: regions,                         // [{ region: "North", revenue: 42 }, …]
  y: "region",                           // not numbers, so it's the category
  x: "revenue",
  sort: "value",
  on: {
    hover: travel(icons.arrow),          // a core icon, in the theme's colours
    update: "flash"                      // a preset: the bars that changed blink
  }
});
await chart.update({ data: nextQuarter }); // values change, then rows move, by the motion mode
```

`travel` takes any icon: the core `dot`, `arrow` and `chevron`, the sport pack's ball and boot, or [an SVG icon from a set such as Lucide or Heroicons](https://github.com/Deaversbp/expressive-charts/blob/main/docs/api.md#an-icon-from-an-icon-set). With the sport pack, a stacked bar tells a story on hover:

```js
import { barChart, sequence, travel } from "expressive-charts";
import { cleat, soccerBall } from "expressive-charts/icons/sport";

barChart("#goals", {
  label: "Goals and assists by player",
  data: players,                         // [{ name: "Okafor", goals: 16, assists: 4 }, …]
  y: "name",
  stack: ["goals", "assists"],
  on: { hover: sequence(travel(soccerBall, { along: "goals" }), travel(cleat, { along: "assists" })) } // a ball rolls out the goals, then a boot steps along the assists
});
```

The same story on bars you already draw with D3:

```js
import { expressive, sequence, travel } from "expressive-charts";
import { cleat, soccerBall } from "expressive-charts/icons/sport";

// bars: your D3 selection of the stacked <rect>s. d3.stack() keeps a series' key on its <g>, so copy it onto each point:
// .data((series) => series.map((d) => Object.assign(d, { key: series.key }))).
const fx = expressive(bars, {
  key: (d) => d.data.name,               // a player's rects are one bar...
  segment: (d) => d.key,                 // ...and its series are the bar's segments
  value: (d) => d[1] - d[0],             // what each rect shows, so a resize isn't an update
  keyboard: true,                        // one tab stop; the arrow keys move between bars
  markLabel: (d) => `${d.data.name}: ${d.data.goals} goals, ${d.data.assists} assists`,
  on: { hover: sequence(travel(soccerBall, { along: "goals" }), travel(cleat, { along: "assists" })) }
});
fx.refresh(bars);                        // after your chart redraws
```

A line that turns red where goals fall below expected goals, with a ball riding its tip, and a season played with a pause control:

```js
import { lineChart, only, parallel, playButton, playback, threshold, travel } from "expressive-charts";
import { soccerBall } from "expressive-charts/icons/sport";

const xg = lineChart("#xg", {
  label: "Goals vs expected goals",
  data: weeks,                           // [{ week: 1, goals: 0, xg: 1.2 }, …]: one row per x, a number or a Date
  x: "week",
  series: ["goals", "xg"],
  legend: { entries: [{ label: "Goals below xG", color: "negative" }] },
  on: { decorate: only("goals", parallel(threshold({ compareTo: "xg" }), travel(soccerBall, { ride: "on" }))) }
});
const season = playback({ from: 1, to: 38, duration: 6500, onFrame: (week) => xg.reveal(week) }); // 6.5 s; 1.95 s in Analysis
playButton("#play", season, { labels: { play: "Play season" } });
```

## What's in it

[docs/api.md](https://github.com/Deaversbp/expressive-charts/blob/main/docs/api.md) documents every export, with its options, their defaults and what it returns.

- **Charts.** [`barChart`](https://github.com/Deaversbp/expressive-charts/blob/main/docs/api.md#barchart) draws bars or columns, plain or stacked; [`donutChart`](https://github.com/Deaversbp/expressive-charts/blob/main/docs/api.md#donutchart) shares of a total; [`lineChart`](https://github.com/Deaversbp/expressive-charts/blob/main/docs/api.md#linechart) a line per series, on a number axis or, when `x` gives `Date`s, a time axis in UTC (or `timeZone: "local"`) worded in the page's locale, with a gap wherever a value is `null` or `undefined`. Each sizes itself to its container, follows the light or dark theme, and has a tooltip, a legend, a data table and keyboard focus. Its handle has `update()`, which animates a change by the motion mode, and `update({ on })` swaps its effects in place; `focus(key)`; `leave()`, which ends its hover; and `labels()`. `table.series` heads a series' column in the data table.
- **Switching.** [`chartSwitch`](https://github.com/Deaversbp/expressive-charts/blob/main/docs/api.md#chartswitch) shows views of the same data one at a time, and turns each mark into its own mark in the next with [`morph()`](https://github.com/Deaversbp/expressive-charts/blob/main/docs/api.md#morph): a donut becoming columns, and back from wherever it is. Its `on()`, `marks()` and `leave()` are the view on show's, and it can be linked like a chart.
- **Adapters.** [`expressive()`](https://github.com/Deaversbp/expressive-charts/blob/main/docs/api.md#expressive) reads keys, rows and geometry from SVG marks drawn by D3, Observable Plot or by hand, with only a key: rects as bars, circles as points, and paths, lines, polylines, polygons and ellipses as shapes, through their transforms. It draws on an overlay, leaving the host's styling alone; `watch: true` follows the host's own transitions. A curve, or a line drawn with d3's `.defined()`, is read from its own path data, with its gaps, and no effect draws inside them; `geometry` describes anything else, or a mark as you'd rather have it. Observable Plot binds each rect or dot to its row's index, so pass `datum: (el) => rows[el.__data__]`; Plot draws a new `<svg>` each time, so pass `refresh()` the new one's marks. The Plot accessors are tested against Plot 0.6.17. [`fromVegaView()`](https://github.com/Deaversbp/expressive-charts/blob/main/docs/api.md#fromvegaview) does the same for a Vega or Vega-Lite View rendered as SVG, and follows its renders; a line breaks where Vega-Lite leaves out a missing value, and a curve is read from the path Vega draws. Both change their effects in place with `update({ on })`, as a chart does, and `leave()` ends their hover.
- **Linked hover.** [`link()`](https://github.com/Deaversbp/expressive-charts/blob/main/docs/api.md#link) links hover across charts, chart switches and attachments by a value their marks share, such as a column's matchweek and the line's x there: hovering one hovers the others' marks with that value, with their emphasis, dimming and hover effects, as `source: "linked"`. Linked charts show no tooltip and take no focus.
- **Effects.** [`travel`](https://github.com/Deaversbp/expressive-charts/blob/main/docs/api.md#travel) carries an icon along a mark; [`flash`](https://github.com/Deaversbp/expressive-charts/blob/main/docs/api.md#flash), [`wiggle`](https://github.com/Deaversbp/expressive-charts/blob/main/docs/api.md#wiggle) and [`pulse`](https://github.com/Deaversbp/expressive-charts/blob/main/docs/api.md#pulse) draw attention without changing a value; [`trace`](https://github.com/Deaversbp/expressive-charts/blob/main/docs/api.md#trace) draws a highlighter stroke along a mark and leaves it there; [`threshold`](https://github.com/Deaversbp/expressive-charts/blob/main/docs/api.md#threshold) colours the parts of a mark below or above a reference; [`delta`](https://github.com/Deaversbp/expressive-charts/blob/main/docs/api.md#delta) labels a mark's change since the last update ("+2"), and [`label`](https://github.com/Deaversbp/expressive-charts/blob/main/docs/api.md#label) any text worked out from its data, past the mark's own labels. Each goes in an effect slot (`hover`, `enter`, `update`, `exit`, `decorate`), as an effect or a preset's name (`"wiggle"`).
- **Controls.** [`motionSwitch()`](https://github.com/Deaversbp/expressive-charts/blob/main/docs/api.md#motionswitch) is the viewer's own choice of mode. [`playback()`](https://github.com/Deaversbp/expressive-charts/blob/main/docs/api.md#playback) plays a value through a range, and [`playButton()`](https://github.com/Deaversbp/expressive-charts/blob/main/docs/api.md#playbutton) is its Play/Pause button.
- **The motion core.** [`motion`](https://github.com/Deaversbp/expressive-charts/blob/main/docs/api.md#motion), [`tween()`](https://github.com/Deaversbp/expressive-charts/blob/main/docs/api.md#tween) and [`animated()`](https://github.com/Deaversbp/expressive-charts/blob/main/docs/api.md#animated), for animations of your own that follow the same modes.

### Writing effects

[`defineEffect`](https://github.com/Deaversbp/expressive-charts/blob/main/docs/api.md#defineeffect) takes a `run` that animates the mark and an `end` that draws where the run ends, which is all reduced motion shows. Both read only the mark's shared description, so this underline works along a bar, round a donut slice or along a line, on our charts and through `expressive()`:

```js
import { barChart, defineEffect } from "expressive-charts";

const underline = defineEffect({
  async run(mark, ctx) {
    const line = ctx.layer.path(mark.slice(0, 0), { stroke: "text-muted", width: 2 });
    let drawn = 0;
    ctx.onChange((next) => line.update((mark = next).slice(0, drawn))); // follows the mark when it moves
    await ctx.tween({ duration: 300, timing: "effect", update: (p) => line.update(mark.slice(0, (drawn = p))) }).finished;
  },
  end(mark, ctx) {
    const line = ctx.layer.path(mark.slice(0, 1), { stroke: "text-muted", width: 2 });
    ctx.onChange((next) => line.update(next.slice(0, 1)));
  }
});
barChart("#sales", { label: "Revenue by region", data: regions, y: "region", x: "revenue", on: { hover: underline } });
```

`expressive-charts/testing` has the conformance suite the built-in effects pass, for any test runner: `await checkEffect(underline)` throws one `Error` listing every check that failed, on every kind of mark. [The effects guide](https://github.com/Deaversbp/expressive-charts/blob/main/docs/effects-guide.md) covers the mark, drawing, timing, end states, data effects, composing, testing and transition effects.

## Entries

| Import | What it is |
| --- | --- |
| `expressive-charts` | The charts, adapters, effects, controls, icons, geometry and motion core. |
| `expressive-charts/icons/sport` | A ball and a boot for `travel`: `soccerBall`, `cleat`, and `sport` for `registerIcons`. |
| `expressive-charts/testing` | The conformance suite for effects: `checkEffect`, `checkTransition`, their fixtures, `testContext` and `play`. |
| `expressive-charts/style.css` | The stylesheet the charts inject, as a file, for a page that loads it itself. |

The script-tag bundle, `dist/expressive-charts.global.js`, is the main entry alone.

## Browsers and TypeScript

- **Browsers.** Current Chrome and Edge, Firefox, and Safari. Every DOM check in the test suite (names, roles, tab order, focus rings, tooltips, keys, switches and reduced motion), with axe's accessibility rules, runs in Chromium, Firefox and WebKit, in Playwright 1.64; the screenshots are Chromium's. That's each browser's engine, not a device: Safari on macOS and iOS hasn't been run itself. The build targets ES2020.
- **TypeScript 5.4 or newer**, since the types use `NoInfer`. The packed package is checked on TypeScript 5.4, 6 and 7, under `bundler` and `node16` resolution, as an ES module and as CommonJS, with `import "expressive-charts/style.css"`. Under the old `node10` (`"node"`), TypeScript can't find the subpath entries' types.
- **Node.js 22 or newer** to import it on a server: nothing touches the DOM until a chart, an adapter or a control is made, and those need one.

## Content-Security-Policy

The first chart, adapter or control on a page injects one `<style>`; everything else is set through the CSSOM, which a strict policy allows, and the library has no `eval`. Under a policy with a `style-src` nonce, give the stylesheet your nonce. Under one with no inline styles at all, load the stylesheet as a file and inject nothing. Call [`configure()`](https://github.com/Deaversbp/expressive-charts/blob/main/docs/api.md#configure) before creating charts:

```js
import { configure } from "expressive-charts";
configure({ nonce: cspNonce });       // the injected <style> takes it
```

```js
import { configure } from "expressive-charts";
import "expressive-charts/style.css"; // the same rules as a file (dist/expressive-charts.css)...
configure({ injectStyles: false });   // ...and nothing injected
```

The package lists its CSS under `sideEffects`, so bundlers keep that import. Charts follow the device's light or dark setting; theme them with `--ec-*` custom properties, which your CSS always overrides, and pin a theme with `data-theme="light"` or `"dark"` on any ancestor ([the stylesheet](https://github.com/Deaversbp/expressive-charts/blob/main/docs/api.md#expressive-chartsstylecss)).

## Accessibility

- **Names.** Each chart is a `role="group"` named by its `label`, and each mark one image named by what it shows: "Okafor: 16 goals, 4 assists", or a slice's "Saved: 112 shots, 28%". `markLabel` words the names ("1 goal") and `markDescription` adds what they don't say.
- **Keyboard.** A chart is one tab stop: the arrow keys move between its marks, Page Up and Page Down by a page (a month on a line's time axis), Home and End go to the ends, and focus shows a ring and plays the same effects as hover. Escape ends a hover, and so does `leave()`.
- **Fallbacks.** A data table after every chart, which every screen reader can read, and with `announce: true` a polite live region that says what each update changed.
- **Motion.** Reduced motion jumps every animation to its end state unless the viewer picks a mode on the page, with `motionSwitch()`. Nothing plays by itself, and a playback has its pause control in `playButton()` (WCAG 2.2.2).
- **Other people's charts.** `expressive()` adds the same keyboard focus with `keyboard: true`, and one name per mark with `markLabel`.

The demo pages with the library's charts on them have had a written WCAG 2.2 AA audit ([a11y-audit.md](https://github.com/Deaversbp/expressive-charts/blob/main/docs/a11y-audit.md)), and the test suite runs axe's WCAG rules on every demo page in Chromium, Firefox and WebKit, in light and dark, at 320 px wide and under forced colours. Screen-reader scripts for NVDA and Chrome, with their results, are in [a11y-check.md](https://github.com/Deaversbp/expressive-charts/blob/main/docs/a11y-check.md#results). The tooltip can be hovered, and dismissed with Escape. Known gap: VoiceOver hasn't been run.

## Limits

SVG charts stay smooth up to a few hundred moving marks. Measured on `demo/stress.html` with `npm run bench` (headless Chromium, each case alone, on an Intel Core i7-12700KF, October 2026), and with Chrome's 4× CPU slowdown standing in for a mid-range phone:

| Case | Smooth up to | At 4× slowdown |
| --- | --- | --- |
| A bar chart's staged update, every value changing | 100 bars | under 100 |
| Hover, dimming the other bars | 1,000 bars | 500 |
| A line on a date axis, played with `threshold` and a riding icon | 5 years of days (1–2 series), 2 years (3–4) | 1 year (1 series) |
| D3 columns in a transition, followed by `watch` | 500 | 20 |
| The same, with `refresh()` at the end | 1,000 | 100 |
| A `chartSwitch` with `morph()` | 200 pairs | 20 |

The first draw of 1,000 static bars takes about 90 ms, and of 10,000 about a second. [architecture.md](https://github.com/Deaversbp/expressive-charts/blob/main/docs/architecture.md#limits) has the method and the numbers.

## The 0.x promise

From 0.1.0 the library follows semantic versioning. While it's 0.x, the effect-author API (`defineEffect`, `defineDataEffect`, `describe`, `matrix`, `offset`, the effect contracts and `expressive-charts/testing`) breaks only in a minor release, with a migration note, and a deprecated name keeps working for one minor release. The charts, adapters, built-in effects, controls and motion core can still change in a minor release, and [CHANGELOG.md](https://github.com/Deaversbp/expressive-charts/blob/main/CHANGELOG.md#the-0x-promise) lists every change. [docs/api.md](https://github.com/Deaversbp/expressive-charts/blob/main/docs/api.md) marks each promised name.

## Links

- [API reference](https://github.com/Deaversbp/expressive-charts/blob/main/docs/api.md): every export of every entry.
- [Architecture](https://github.com/Deaversbp/expressive-charts/blob/main/docs/architecture.md): how the layers fit together, and how each part behaves.
- [Writing effects](https://github.com/Deaversbp/expressive-charts/blob/main/docs/effects-guide.md): the guide for effect authors.
- [Examples](https://github.com/Deaversbp/expressive-charts/tree/main/docs/sketches/examples): pages written against the API, which `npm run typecheck` checks: ball-and-cleat bars, a goals vs xG line with playback, a donut that morphs into columns, D3 charts, effects of your own and presets.
- [Changelog](https://github.com/Deaversbp/expressive-charts/blob/main/CHANGELOG.md), and [the development log](https://github.com/Deaversbp/expressive-charts/blob/main/docs/plan.md): the plan the library was built to, milestone by milestone, with the reasoning behind each decision.
- [Accessibility audit](https://github.com/Deaversbp/expressive-charts/blob/main/docs/a11y-audit.md) and [screen-reader scripts](https://github.com/Deaversbp/expressive-charts/blob/main/docs/a11y-check.md).
- [Demos](https://github.com/Deaversbp/expressive-charts/tree/main/demo), on [the demo site](https://deaversbp.github.io/expressive-charts/), or served by `npm run dev`. `bars.html`, `donut.html`, `line.html` and `morph.html` put the library's charts beside D3, Vega-Lite and hand-written ones, with the same effects on each; `season.html` links three charts by matchweek and labels each change with `delta()` and `label()`; `stress.html` is the limits above; and `lab.html` is the single-file prototype the library grew out of.
- [Contributing](https://github.com/Deaversbp/expressive-charts/blob/main/CONTRIBUTING.md) and [issues](https://github.com/Deaversbp/expressive-charts/issues).

## Development

| Command | What it does |
| --- | --- |
| `npm run dev` | Serves the `demo/` folder with live reload |
| `npm run build` | Builds the npm package (ESM + CommonJS, each with its own types, with the `icons/sport` and `testing` entries), a script-tag bundle (`dist/expressive-charts.global.js`) and the stylesheet as a file (`dist/expressive-charts.css`) |
| `npm run size` | Measures the built package and fails when a size is over its budget in `scripts/size-budget.json` (see [CONTRIBUTING.md](https://github.com/Deaversbp/expressive-charts/blob/main/CONTRIBUTING.md#bundle-size)) |
| `npm run pack-check` | After a build: packs the package, installs it in a new project and checks every entry as ESM and CommonJS, with its types (see [CONTRIBUTING.md](https://github.com/Deaversbp/expressive-charts/blob/main/CONTRIBUTING.md#setup)) |
| `npm test` | Runs the test suite, which also checks [docs/api.md](https://github.com/Deaversbp/expressive-charts/blob/main/docs/api.md) against the exports and type-checks this README's examples |
| `npm run test:visual:docker` | Runs the screenshot tests of `demo/bars.html`, `donut.html`, `line.html`, `morph.html`, `season.html` and `stress.html` in Chromium, and their DOM checks and the accessibility checks (axe) in Chromium, Firefox and WebKit, in Playwright's Linux image (needs Docker; see [CONTRIBUTING.md](https://github.com/Deaversbp/expressive-charts/blob/main/CONTRIBUTING.md#visual-tests)) |
| `npm run build:site` | Builds the demo pages into `site/`, which `.github/workflows/pages.yml` publishes as [the demo site](https://deaversbp.github.io/expressive-charts/) |
| `npm run media` | Captures README's pictures (`docs/media/*.gif`) from the demo pages, frame by frame, in Playwright's Linux image (needs Docker; see [CONTRIBUTING.md](https://github.com/Deaversbp/expressive-charts/blob/main/CONTRIBUTING.md#readmes-pictures-and-the-demo-site)) |
| `npm run bench` | Measures the stress page's cases in headless Chromium against `npm run dev`, unthrottled and at 4×, about 47 minutes; not in CI |
| `npm run typecheck` | Checks types without building |

Requires Node.js 22 or newer (CI tests 22 and 24).

## License

[MIT](https://github.com/Deaversbp/expressive-charts/blob/main/LICENSE)
