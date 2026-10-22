# expressive-charts

Composable motion and expressive effects for web charts. Hover, update and morph animations that work across bar, line and donut charts, including SVG charts you've already built with D3 or Observable Plot, and Vega or Vega-Lite charts rendered as SVG (vega-embed's default). Presentation, analysis and reduced-motion modes are built in.

> **Status: pre-alpha.** The motion core, the mark geometry, the effect runner, a bar chart and a donut chart, the `expressive()` adapter for marks drawn by other code, icons, the first effects (`travel`, `flash`, `wiggle`, `pulse` and the data effect `threshold`, with `sequence`, `parallel`, `only` and `stagger`), the viewer's `motionSwitch`, `playback()` with its `playButton()`, and a public API for [writing your own effects](#writing-effects) are built ([below](#available-now-the-motion-core-mark-geometry-bar-and-donut-charts-travel-and-the-adapter)). The line chart and `morph` are still to come. Nothing is published to npm. See [docs/plan.md](docs/plan.md) for the roadmap.

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

## Available now: the motion core, mark geometry, bar and donut charts, travel and the adapter

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

A first, thin bar chart draws horizontal bars or columns, plain or stacked, sized to its container, with theme colours (`--ec-*` custom properties), hover dimming and hover events. Hovering, tapping or focusing a bar shows a tooltip, and a stacked chart has a legend. It's one tab stop: the arrow keys move between the bars, and keyboard focus plays the same hover effects inside a focus ring. Screen readers hear the chart as a group named by its `label`, and each bar as one image named by its values ("Okafor: 16 goals, 4 assists"), which `markLabel` can word ("Castillo: 1 goal"). `markDescription` adds what the name doesn't say, such as a player's position, without repeating it. `seriesLabels` names the series for people (`{ xg: "Expected goals" }`) wherever the chart names them: the legend, tooltip, table and bar names. Under the chart, a "Data table" lists the same numbers in the chart's order, the fallback every screen reader can read; `table: "hidden"` keeps it out of sight, and `table.columns` adds the page's own columns, after the category or, with `after: "values"`, last. `legend: { entries }` adds swatches after the series for colours the page's effects draw, each a theme token or a CSS colour: `{ label: "Goals below xG", color: "negative" }`. `announce: true` adds a polite live region that says what each update changed. Its effect slots take effects or registered presets. `update()` animates the change by the motion mode: in Presentation the values change first (bars resize, the scale follows) and then the rows move to their new places, about half a second each; Analysis does it all at once in about 200 ms; Off jumps. A second `update()` mid-change carries on from where everything is, and hover effects replay once the change settles.

```js
import { barChart } from "expressive-charts";

const singular = { goals: "goal", assists: "assist" };
const chart = barChart("#goals", {
  label: "Goals by player",            // the accessible name, required
  data: players,
  y: "name",                           // not numbers, so it's the category
  stack: ["goals"],
  sort: "value",
  colors: { goals: 1, assists: 4 },    // palette slots that follow the series, never the rank
  seriesLabels: { goals: "Goals", assists: "Assists" }, // the series' names in the legend, table and default text
  tooltip: (d) => `${d.name}\n${d.goals} goals`, // plain text, never HTML; default: category, values, total
  markLabel: (d, mark) =>              // each bar's accessible name; the default says "1 goals"
    `${d.name}: ${mark.values.map((v) => `${mark.format(v.value)} ${v.value === 1 ? singular[v.series] : v.series}`).join(", ")}`,
  legend: true,                        // the default: swatches when more than one series shows; or { entries: [...] }
  table: { columns: [{ label: "Position", field: "pos" }] }, // the default data table, plus a column (after: "values" puts it last)
  announce: true,                      // off by default: "Sorted A to Z", "Okafor and Tanaka changed"
  on: { hover: "nudge" }
});
chart.on("hover", (e) => console.log(e.mark.key, e.data.datum));
await chart.update({ stack: ["goals", "assists"] }); // resolves once the change has settled
```

A donut chart shows shares of a total. Its slices go clockwise from 12 o'clock, in data order or largest first, each labelled outside the ring with its share, and the total sits in the hole. It works like the bar chart: the same hover, tooltip, keyboard focus (the arrow keys go round the ring), data table (with each share and a total row), announcements and effect slots, so the effects that run on bars run on its slices unchanged. Screen readers hear each slice as "Saved: 112 shots, 28%". On `update()` the values change first, with every angle a true share of the total as it is, and then the slices turn the shorter way round to their new places:

```js
import { donutChart, travel } from "expressive-charts";
import { soccerBall } from "expressive-charts/icons/sport";

const shots = donutChart("#shots", {
  label: "Shot outcomes",
  data: outcomes,                      // [{ outcome: "Goal", shots: 58 }, ...]
  category: "outcome",                 // names each slice, and is its key
  value: "shots",
  sort: "value",                       // largest first; the default is data order
  center: (total, format) => `${format(total)}\nshots`, // the default: the total over the value's label
  on: { hover: travel(soccerBall), update: "flash" } // the ball rolls round the slice
});
await shots.update({ data: afterMatchweek });
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

`wiggle` and `pulse` are the other built-in presets. `wiggle` rocks the mark on its pivot (a bar on its baseline, a donut slice about the centre) in three dying half-swings, and never moves any part of it more than 3 px, so it can't misstate a value; `swing` makes it smaller. `pulse` sends a halo out from the outline and fades it, twice by default (`times`, 1 to 6). It never changes the mark's size, and however a page scales its motion it ends within 5 s. Both end with the mark as the chart drew it. `stagger(effect, { delay })` starts each mark of a batch a little after the one before, 50 ms by default with the whole spread at most 500 ms, and only in Presentation. Nothing staggers unless asked, since research finds it rarely helps:

```js
import { barChart, pulse, stagger } from "expressive-charts";

barChart("#sales", { label: "Revenue by region", data, y: "region", x: "revenue", on: { hover: "wiggle" } });
barChart("#goals", { label: "Goals by player", data: players, y: "name", x: "goals", on: { enter: stagger(pulse({ times: 1 })) } });
```

`threshold` is the first data effect. It colours the parts of a mark where its values are below a reference, or above it with `when: "above"`, in the theme's negative colour unless `color` says otherwise. The reference is a number, or a related series' name (`compareTo: "xg"`, matched by each sample's `at`, such as a line's x). Each coloured part ends exactly where the values cross. It's an encoding rather than motion: it draws at once, follows the mark on every change, and shows the same with motion off, so it goes in `on.decorate`:

```js
import { barChart, threshold } from "expressive-charts";

// The part of each bar past a 10-goal target, across the bar's full thickness.
const pastTarget = threshold({ compareTo: 10, when: "above", color: "series-1-strong" });
barChart("#goals", { label: "Goals by player", data: players, y: "name", x: "goals", on: { decorate: pastTarget } });
```

`motionSwitch()` is the viewer's own control: Presentation, Analysis and Off as buttons with `aria-pressed`, and a note on what the mode does. A click is the viewer's choice, so it overrides the device's reduced-motion setting; until then, Off is pressed and the note says why. It follows the motion whoever changes it, and `persist` (opt-in) keeps the choice in `localStorage`:

```js
import { motion, motionSwitch } from "expressive-charts";

const control = motionSwitch("#motion", motion, { persist: "site:motion" }); // motion defaults to the page-wide one
control.destroy();                                                            // removes it; the choice stays
```

`playback()` plays a value through a range, such as a season revealed week by week, and `playButton()` is its Play/Pause button, the pause control WCAG 2.2.2 asks for. A play takes its share of the duration from wherever it is (scaled by the motion mode: 6.5 s becomes 1.95 s in Analysis, and Off jumps to the end), and nothing plays by itself. `seek()` pauses and glides to a position, as a scrubber needs, and `subscribe()` hears play, pause, the end and seeks:

```js
import { playback, playButton } from "expressive-charts";

const season = playback({ from: 1, to: 38, duration: 6500, onFrame: (week) => drawThrough(week) }); // starts at rest at the end
playButton("#play", season, { labels: { play: "Play season" } }); // "Play season" / "Pause", back to Play at the end
range.addEventListener("input", () => season.seek(Number(range.value)));
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
  markLabel: (d) => `${d.data.name}: ${d.data.goals} goals, ${d.data.assists} assists`, // each bar read as one item
  on: { hover: ballThenCleat }
});
fx.refresh(svg.selectAll("rect"));                   // after the page redraws: enter, update and exit by key
```

For Observable Plot, which binds each rect to its row's index, pass `datum: (el) => rows[el.__data__]`. Without `value`, the adapter compares lengths, so a resize or a new axis maximum counts as an update for every bar (and `update: "flash"` flashes them all); with it, only bars whose values changed get one, as on `barChart`.

Other shapes take a `geometry` callback built with `describe`. A D3 donut, for example, drawn with `d3.pie()` and `d3.arc().innerRadius(70).outerRadius(116)` in a `<g>` centred on the donut:

```js
import { describe, expressive, travel } from "expressive-charts";
import { soccerBall } from "expressive-charts/icons/sport";

const fx = expressive(svg.selectAll("path.slice"), {
  key: (d) => d.data.outcome,
  value: (d) => d.value,   // or one new value updates every slice: the total changes, so every arc does
  geometry: (_el, d, key) => describe.arc({ key, cx: 0, cy: 0, inner: 70, outer: 116, start: d.startAngle, end: d.endAngle }),
  keyboard: true,          // the arrow keys go clockwise from 12 o'clock
  on: { hover: travel(soccerBall) }
});
```

The radii live in the arc generator, not in the row, so the page passes them to `describe.arc`. `d3.pie()` sorts slices by value but leaves the paths in data order; the adapter orders slices that share a centre clockwise from 12 o'clock, so keyboard focus goes round the ring.

A line drawn by `d3.line()` is described from the points that drew it. Data effects also need its values along the way: `samplesAlong` projects the same points onto the line, and since each line's geometry names its series, `related("xg")` on the goals line finds the xG path. Rects with a numeric `value` get the bar chart's samples without asking.

```js
import { describe, expressive, only, samplesAlong, threshold } from "expressive-charts";

// One <path> per series, its datum { series, rows }, drawn with x(week) and y(value).
const points = (d) => d.rows.map((r) => ({ x: x(r.week), y: y(r.value), value: r.value, at: r.week }));
const fx = expressive(svg.selectAll("path.line"), {
  key: (d) => d.series,
  geometry: (_el, d, key) => describe.line({ key, series: d.series, points: points(d), width: 2 }),
  samples: (d, mark) => samplesAlong(mark, points(d)), // checked when read: t from 0 to 1, finite values
  dim: true,                                           // the other line fades, and the hovered one's stroke darkens
  on: { decorate: only("goals", threshold({ compareTo: "xg" })) } // red wherever goals are below xG
});
```

A data effect that `needs` a series the marks don't have throws when the attachment is made, or on the `refresh()` that loses it. With `dim: true`, the hovered mark darkens as on our charts: its fill, or its stroke when the fill is `none`, which is also the colour its halos and emphasis start from.

The adapter adds no ARIA of its own unless you pass `markLabel`. Given it, each bar is read as one item, as on `barChart`: the rect that takes the bar's focus becomes `role="img"` named by `markLabel`, and the bar's other segments are hidden from screen readers, so a stack isn't read in pieces. The `<svg>` stays yours: make it `role="group"`, not `role="img"`, whose children screen readers skip, and hide your own value labels if the names already say them.

See [docs/architecture.md](docs/architecture.md#core) for the motion API, [Mark geometry](docs/architecture.md#mark-geometry) for the builders, [Effects](docs/architecture.md#effects) and [Icons](docs/architecture.md#icons) for `travel`, `flash`, `wiggle`, `pulse`, `threshold`, the combinators (`stagger` too) and icons, [Runner](docs/architecture.md#runner) for how effects are played on marks, [Reference charts](docs/architecture.md#reference-charts) for the bar and donut charts, [Adapters](docs/architecture.md#adapters) for `expressive()`, and [Controls](docs/architecture.md#controls) for `motionSwitch()`, `playback()` and `playButton()`. [docs/effects-guide.md](docs/effects-guide.md) is the guide to writing effects.

## Writing effects

Effects of your own work everywhere the built-in ones do. `defineEffect` takes a `run` that animates the mark and an `end` that draws where the run ends, which is all reduced motion shows. Both read only the mark's shared description, so this one draws along a bar, around a donut slice or along a line, on our charts and through `expressive()`. Both follow `ctx.onChange`, so the underline stays on the mark when it moves:

```js
import { barChart, defineEffect } from "expressive-charts";

const underline = defineEffect({
  async run(mark, ctx) {
    const line = ctx.layer.path(mark.slice(0, 0), { stroke: "text-muted", width: 2 });
    let drawn = 0;
    ctx.onChange((next) => line.update((mark = next).slice(0, drawn)));
    await ctx.tween({ duration: 300, timing: "effect", update: (p) => line.update(mark.slice(0, (drawn = p))) }).finished;
  },
  end(mark, ctx) {
    const line = ctx.layer.path(mark.slice(0, 1), { stroke: "text-muted", width: 2 });
    ctx.onChange((next) => line.update(next.slice(0, 1)));
  }
});
barChart("#sales", { label: "Revenue by region", data, y: "region", x: "revenue", on: { hover: underline } });
```

`ctx.tween` keeps every duration under the motion modes. `defineDataEffect` makes effects that read the mark's row and values, with the row type checked against the chart's. `expressive-charts/testing` has the conformance suite the built-in effects pass, for any test runner:

```js
import { checkEffect } from "expressive-charts/testing";

await checkEffect(underline); // throws one Error listing every check that failed, on every kind of mark
```

The [effects guide](docs/effects-guide.md) covers the mark contract, drawing, timing, end states, keeping data readable, data effects, composing and testing, with two worked examples and a review checklist. This author API is covered by the 0.x promise in [CHANGELOG.md](CHANGELOG.md): from 0.1.0, it breaks only in a minor release, with a migration note.

## Demo

`demo/lab.html` is the original prototype that this library grew out of: a staged, sortable bar chart with ball and cleat hover effects, a goals vs expected goals line that turns red below expectation, and a donut that morphs into bars. Open it directly in a browser, or run the dev server:

```sh
npm install
npm run dev
```

The dev server's index links the demos built on the library:

- `demo/bars.html`: the lab's first card on `barChart`, with the ball and cleat, staged sorting, "Play next matchweek", and the same story on a hand-written SVG chart through `expressive()`.
- `demo/donut.html`: the lab's third card without its morph. The shot outcomes on `donutChart`, as columns on `barChart`, and on a D3 pie through `expressive()`, with one picker for the hover effect (the ball, `"wiggle"` or `"pulse"`) and "Next match" flashing the slices that changed (`stagger(flash())`).

## Development

| Command | What it does |
| --- | --- |
| `npm run dev` | Serves the `demo/` folder with live reload |
| `npm run build` | Builds the npm package (ESM + CommonJS + types, with the `icons/sport` and `testing` entries), a script-tag bundle (`dist/expressive-charts.global.js`) and the stylesheet as a file (`dist/expressive-charts.css`) |
| `npm test` | Runs the test suite |
| `npm run test:visual:docker` | Runs the screenshot tests of `demo/bars.html` and `demo/donut.html` in Chromium, in Playwright's Linux image (needs Docker; see [CONTRIBUTING.md](CONTRIBUTING.md#visual-tests)) |
| `npm run typecheck` | Checks types without building |

Requires Node.js 22 or newer (CI tests 22 and 24).

See [docs/architecture.md](docs/architecture.md) for how the layers fit together and [CONTRIBUTING.md](CONTRIBUTING.md) for how to add a chart or an effect.

## License

[MIT](LICENSE)
