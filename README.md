# expressive-charts

Composable motion and expressive effects for web charts. Hover, update and morph animations that work across bar, line and donut charts, with presentation, analysis and reduced-motion modes built in.

> **Status: pre-alpha.** The motion core is built ([below](#available-now-the-motion-core)). Charts and effects are next, so the chart API under "Design target" isn't usable yet. Nothing is published to npm. See [docs/plan.md](docs/plan.md) for the roadmap.

## The idea

Most chart libraries treat animation as an afterthought: a fixed transition you can turn on or off. expressive-charts treats motion as a first-class design layer. Effects are small, reusable pieces that work on any chart type, and a central motion system keeps them readable and accessible.

The library has three layers:

1. **Motion core.** One animation clock, easing, cancellation, and the motion modes: Presentation (staged, around one second), Analysis (fast, under about 200 ms, no staging) and Off. The device's reduced-motion setting is respected unless the viewer picks a mode on the page themselves.
2. **Charts.** Bar, line, donut and more. Every chart describes its marks the same way (start point, end point, a path to travel along, and an outline) and announces events like hover and data updates.
3. **Effects.** Plugins such as `travel`, `wiggle`, `pulse`, `flash`, `threshold` and `morph`. Effects only read the shared mark description, so one effect works on every chart.

## Design target

```js
import { barChart, effects } from "expressive-charts";

barChart("#goals", {
  data: players,
  y: "name",
  stack: ["goals", "assists"],
  motion: "presentation",
  hover: effects.sequence(
    effects.travel("soccer-ball", { along: "goals" }),
    effects.travel("cleat", { along: "assists" })
  )
});
```

Preset names give a one-line shortcut for common cases:

```js
barChart("#sales", { data, y: "region", x: "revenue", hover: "wiggle" });
```

## Available now: the motion core

The first layer is built: the shared animation clock, tweens, retargetable values and motion modes that charts and effects will run on.

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

See [docs/architecture.md](docs/architecture.md#core) for the full API.

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
