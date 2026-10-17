# expressive-charts

Composable motion and expressive effects for web charts. Hover, update and morph animations that work across bar, line and donut charts, including charts you've already built with D3, Plot or Vega. Presentation, analysis and reduced-motion modes are built in.

> **Status: pre-alpha.** The motion core and the mark geometry are built ([below](#available-now-the-motion-core-and-mark-geometry)). Charts and effects are next, so the chart API under "Design target" isn't usable yet. Nothing is published to npm. See [docs/plan.md](docs/plan.md) for the roadmap.

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

## Available now: the motion core and mark geometry

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

See [docs/architecture.md](docs/architecture.md#core) for the motion API and [Mark geometry](docs/architecture.md#mark-geometry) for the builders.

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
| `npm run build` | Builds the npm package (ESM + types) and a script-tag bundle (`dist/expressive-charts.global.js`) |
| `npm test` | Runs the test suite |
| `npm run typecheck` | Checks types without building |

Requires Node.js 22 or newer (CI tests 22 and 24).

See [docs/architecture.md](docs/architecture.md) for how the layers fit together and [CONTRIBUTING.md](CONTRIBUTING.md) for how to add a chart or an effect.

## License

[MIT](LICENSE)
