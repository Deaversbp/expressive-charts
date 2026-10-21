# expressive-charts

Composable motion and expressive effects for web charts. Hover, update and morph animations that work across bar, line and donut charts, including SVG charts you've already built with D3 or Observable Plot, and Vega or Vega-Lite charts rendered as SVG (vega-embed's default). Presentation, analysis and reduced-motion modes are built in.

> **Status: pre-alpha.** The motion core, the mark geometry, the effect runner, a first bar chart, the `expressive()` adapter for bars drawn by other code, icons, the first effects (`travel` and `flash`, with `sequence`, `parallel` and `only`) and the viewer's `motionSwitch` are built ([below](#available-now-the-motion-core-mark-geometry-a-bar-chart-travel-and-the-adapter)). The other built-in effects are next, so `wiggle`, `pulse`, `threshold` and `morph` under "Design target" aren't usable yet. Nothing is published to npm. See [docs/plan.md](docs/plan.md) for the roadmap.

## The idea

Most chart libraries treat animation as an afterthought: a fixed transition you can turn on or off. expressive-charts treats motion as a first-class design layer. Effects are small, reusable pieces that work on any chart type, and a central motion system keeps them readable and accessible.

The library has three layers:

1. **Motion core.** One animation clock, easing, cancellation, and the motion modes: Presentation (staged, around one second), Analysis (fast, under about 200 ms, no staging) and Off. The device's reduced-motion setting is respected unless the viewer picks a mode on the page themselves.
2. **Charts and adapters.** Our reference bar, line and donut charts, plus adapters that describe marks drawn by other libraries. Every mark is described the same way (start point, end point, a path to travel along, and an outline), and every mark announces events like hover and data updates.
3. **Effects.** Plugins such as `travel`, `wiggle`, `pulse`, `flash`, `threshold` and `morph`. Effects only read the shared mark description, so one effect works on every chart.

## Design target

```js
import { barChart, sequence, travel } from "expressive-charts";
import { soccerBall, cleat } from "expressive-charts/icons/sport";

barChart("#goals", {
  label: "Goals and assists by player",
  data: players,
  y: "name",
  stack: ["goals", "assists"],
  on: {
    hover: sequence(
      travel(soccerBall, { along: "goals" }),
      travel(cleat, { along: "assists" })
    )
  }
});
```

The same effects on a chart you already have, for example D3 bars:

```js
import { expressive, travel } from "expressive-charts";

expressive(d3.selectAll("#existing rect"), {
  key: (d) => d.name,
  baseline: "left",
  on: { hover: travel(soccerBall) }
});
```

Preset names give a one-line shortcut for common cases:

```js
barChart("#sales", { label: "Revenue by region", data, y: "region", x: "revenue", on: { hover: "wiggle" } });
```

More examples, all type-checked against the proposed API, are in [docs/sketches](docs/sketches/).

## Available now: the motion core, mark geometry, a bar chart, travel and the adapter

The first layer is built: the shared animation clock, tweens, retargetable values and motion modes that charts and effects will run on, plus the shared mark description they meet through.

```js
import { motion, animated, interpolateNumber } from "expressive-charts";

motion.setMode("presentation");                         // the author's default; never overrides reduced motion
switchButton.onclick = () => motion.chooseMode("analysis"); // the viewer's choice; does override it

const width = animated(0, interpolateNumber, {
  onChange: (w) => bar.setAttribute("width", String(w))
});
width.to(320, { duration: 500 }); // 500 ms in presentation, 175 ms in analysis, instant when off
width.to(120, { duration: 500 }); // retargets from wherever it is now, without a jump
```

The geometry builders describe a mark the way every effect reads it: a walk from where the data starts to where it ends, measured by distance, plus an outline.

```js
import { describe, offset } from "expressive-charts";

const bar = describe.bar({
  key: "Okafor", x: 0, y: 0, width: 220, height: 22, baseline: "left", radius: 4, gap: 2,
  segments: [{ series: "goals", size: 160 }, { series: "assists", size: 60 }]
});
bar.path(0.5);                                   // halfway along the bar, on screen
bar.segments[1].slice(0, 1);                     // SVG path data along the assists segment
offset(bar.end, bar.angle(1) - Math.PI / 2, 8);  // 8 px to the up side of the tip

const slice = describe.arc({ key: "Saved", cx: 0, cy: 0, inner: 70, outer: 116, start: d.startAngle, end: d.endAngle }); // d3.pie() angles
```

Presets and icons are registered by name, page-wide, for charts to look up when they're created:

```js
import { registerIcons, registerPreset } from "expressive-charts";

registerPreset("nudge", () => myEffect); // then on: { hover: "nudge" } in any chart; unknown names throw
registerIcons(myIcons);                  // then travel("my-icon")
```

A first, thin bar chart draws horizontal bars or columns, plain or stacked, sized to its container, with theme colours (`--ec-*` custom properties), hover dimming and hover events. Hovering, tapping or focusing a bar shows a tooltip, and a stacked chart has a legend. It's one tab stop: the arrow keys move between the bars, and keyboard focus plays the same hover effects inside a focus ring. Screen readers hear the chart as a group named by its `label`, and each bar as one image named by its values ("Okafor: 16 goals, 4 assists"). Under the chart, a "Data table" lists the same numbers in the chart's order, the fallback every screen reader can read; `table: "hidden"` keeps it out of sight. `announce: true` adds a polite live region that says what each update changed. Its effect slots take effects or registered presets. `update()` animates the change by the motion mode: in Presentation the values change first (bars resize, the scale follows) and then the rows move to their new places, about half a second each; Analysis does it all at once in about 200 ms; Off jumps. A second `update()` mid-change carries on from where everything is, and hover effects replay once the change settles.

```js
import { barChart } from "expressive-charts";

const chart = barChart("#goals", {
  label: "Goals by player",            // the accessible name, required
  data: players,
  y: "name",                           // not numbers, so it's the category
  stack: ["goals"],
  sort: "value",
  colors: { goals: 1, assists: 4 },    // palette slots that follow the series, never the rank
  tooltip: (d) => `${d.name}\n${d.goals} goals`, // plain text, never HTML; default: category, values, total
  legend: true,                        // the default: swatches when more than one series shows
  table: { columns: [{ label: "Position", field: "pos" }] }, // the default data table, plus a column
  announce: true,                      // off by default: "Sorted A to Z", "Okafor and Tanaka changed"
  on: { hover: "nudge" }
});
chart.on("hover", (e) => console.log(e.mark.key, e.data.datum));
await chart.update({ stack: ["goals", "assists"] }); // resolves once the change has settled
```

Charts follow the device's light or dark setting, with eight series colours checked for contrast and colour-vision deficiencies in both. Theme them with `--ec-*` custom properties, which your CSS always overrides, and pin a theme with `data-theme` on any ancestor ([Rendering](docs/architecture.md#rendering) has the details):

```html
<html data-theme="light">  <!-- a page without a dark theme of its own -->
<style>.sales { --ec-series-1: #0f766e; }</style>
```

Under a Content-Security-Policy, give the stylesheet the charts inject your nonce, or load it as a file and inject nothing. The package lists its CSS under `sideEffects`, so bundlers keep the CSS import even though it imports no names. Call `configure()` before creating charts:

```js
import { configure } from "expressive-charts";
configure({ nonce: cspNonce });       // the injected <style> takes it

import "expressive-charts/style.css"; // or the same rules as a file (dist/expressive-charts.css)...
configure({ injectStyles: false });   // ...and nothing injected
```

The first effect carries an icon along a mark: a ball rolling out a bar, around a donut slice or along a line. Combinators put effects together, and a step with nothing to do (a segment the chart isn't showing) finishes at once:

```js
import { barChart, icons, iconFromSvg, only, sequence, travel } from "expressive-charts";
import { cleat, soccerBall } from "expressive-charts/icons/sport"; // optional pack; the core icons are dot, arrow and chevron

const ballThenCleat = sequence(
  travel(soccerBall, { along: "goals" }), // rolls out the goals segment and stays...
  travel(cleat, { along: "assists" })     // ...then the boot steps along the assists
);
barChart("#goals", { label: "Goals and assists", data: players, y: "name", stack: ["goals", "assists"], on: { hover: ballThenCleat } });

const arrows = only("revenue", travel(icons.arrow, { size: "fit" }));
const pin = iconFromSvg(svgMarkup, { name: "pin", size: 16, anchor: { x: 12, y: 22 } }); // keeps only plain shapes
```

`flash` marks a change: one halo blink along the outline, the prototype's 900 ms. In the `update` slot it runs on the bars whose values changed, not on a re-sort. With motion off it draws nothing, since the new value it points at is on the chart anyway:

```js
const chart = barChart("#goals", { label: "Goals by player", data: players, y: "name", x: "goals", on: { update: "flash" } });
chart.update({ data: afterMatchweek }); // the bars that scored blink as they grow
```

`motionSwitch()` is the viewer's own control: Presentation, Analysis and Off as buttons with `aria-pressed`, and a note on what the mode does. A click is the viewer's choice, so it overrides the device's reduced-motion setting; until then, Off is pressed and the note says why. It follows the motion whoever changes it, and `persist` (opt-in) keeps the choice in `localStorage`:

```js
import { motion, motionSwitch } from "expressive-charts";

const control = motionSwitch("#motion", motion, { persist: "site:motion" }); // motion defaults to the page-wide one
control.destroy();                                                            // removes it; the choice stays
```

The same effects run on bars someone else drew. `expressive()` reads keys, rows and geometry from the host's `<rect>` elements and draws on an overlay at the end of its `<svg>`. It leaves the host's styling alone, and `destroy()` puts back everything it changed:

```js
import { expressive, sequence, travel } from "expressive-charts";

// A D3 stacked bar chart: one <g> per series, one <rect> per player, as d3.stack() draws it.
const fx = expressive(svg.selectAll("rect"), {
  key: (d) => d.data.name,                          // required: the mark's identity
  segment: (_d, el) => el.parentNode.__data__.key,  // a player's rects become one bar's segments
  value: (d) => d[1] - d[0],                        // what each rect shows: updates follow values, not lengths
  baseline: "auto",                                 // the edge every bar grows from (the default)
  keyboard: true,                                   // focusable bars; focus plays the hover story
  on: { hover: ballThenCleat }
});
fx.refresh(svg.selectAll("rect"));                   // after the page redraws: enter, update and exit by key
```

For Observable Plot, which binds each rect to its row's index, pass `datum: (el) => rows[el.__data__]`. Other shapes take a `geometry` callback built with `describe`. Without `value`, the adapter compares lengths, so a resize or a new axis maximum counts as an update for every bar (and `update: "flash"` flashes them all); with it, only bars whose values changed get one, as on `barChart`.

See [docs/architecture.md](docs/architecture.md#core) for the motion API, [Mark geometry](docs/architecture.md#mark-geometry) for the builders, [Effects](docs/architecture.md#effects) and [Icons](docs/architecture.md#icons) for `travel`, `flash`, the combinators and icons, [Runner](docs/architecture.md#runner) for how effects are played on marks, [Reference charts](docs/architecture.md#reference-charts) for the bar chart, [Adapters](docs/architecture.md#adapters) for `expressive()`, and [Controls](docs/architecture.md#controls) for `motionSwitch()`.

## Demo

`demo/lab.html` is the original prototype that this library grew out of: a staged, sortable bar chart with ball and cleat hover effects, a goals vs expected goals line that turns red below expectation, and a donut that morphs into bars. Open it directly in a browser, or run the dev server:

```sh
npm install
npm run dev
```

## Development

| Command | What it does |
| --- | --- |
| `npm run dev` | Serves the `demo/` folder with live reload |
| `npm run build` | Builds the npm package (ESM + CommonJS + types, with the `icons/sport` entry), a script-tag bundle (`dist/expressive-charts.global.js`) and the stylesheet as a file (`dist/expressive-charts.css`) |
| `npm test` | Runs the test suite |
| `npm run test:visual:docker` | Runs the screenshot tests of `demo/bars.html` in Chromium, in Playwright's Linux image (needs Docker; see [CONTRIBUTING.md](CONTRIBUTING.md#visual-tests)) |
| `npm run typecheck` | Checks types without building |

Requires Node.js 22 or newer (CI tests 22 and 24).

See [docs/architecture.md](docs/architecture.md) for how the layers fit together and [CONTRIBUTING.md](CONTRIBUTING.md) for how to add a chart or an effect.

## License

[MIT](LICENSE)
