# charts

Chart components (bar, line, donut, and later more). Each chart gives every mark a stable key, describes it with `MarkGeometry`, and emits `enter`, `update`, `exit`, `hover` and `leave` events. Charts import only from core and never name a specific effect: the composition root (`src/index.ts`) hands them the preset and icon registries as a `ChartEnv`.

| File | What it holds |
| --- | --- |
| `bar.ts` | `barChart`: its marks, ticks and focus ring in the DOM, staged and interruptible updates (`retarget`), and what the table, legend and announcements say; the rest is in `shell/` |
| `shell/` | What charts share beyond their marks, built from callbacks rather than a base class: mark events (`events.ts`), one hover for pointer, touch and keyboard focus (`hover.ts`), transitions and the runner's order for an update (`transitions.ts`), leaving marks (`leaving.ts`), DOM order that keeps focus (`order.ts`), the container's width, web fonts and the hover duration (`watch.ts`), the labels a chart's `labels()` reports (`labels.ts`), and `ChartEnv`, the container, the accessible name and the `needs` check (`setup.ts`) and the default `format` (`format.ts`) |
| `bar-layout.ts` | The bar chart's layout, pure: encoding, sorting, the nice scale, the frame (scale and bands), and `placeRow` / `placeTick`, which draw a laid-out row or any state in between |
| `line.ts` | `lineChart`: its lines, points, x columns (the focus stops), crosshair, end labels and ticks in the DOM, `reveal`, and staged updates in which rows grow out of and fold into their neighbours |
| `line-layout.ts` | The line chart's layout, pure: encoding, the frame (value scale and plot box), and `placeLines` / `placePoints` / `placeColumns` / `placeEndLabels`, which draw any state of the rows at any reveal |
| `types.ts` | What charts share: options, `MarkEvent(s)`, `Chart`, accessors |
| `colors.ts` | `colorAssignment`: palette slots that follow the entity |
| `series.ts` | `seriesLabels`: a series' name for people, and checking the option |
| `motion.ts` | A chart's motion from its `motion` option |
| `keyboard.ts` | Keyboard focus, shared by `barChart` and `expressive()`: the roving tabindex, arrow keys, Home, End and Escape, whether focus followed a key press, and where focus goes when its mark leaves or its element is replaced |
| `interaction.ts` | Pointer and touch hover, delegated from the `<svg>` |
| `tooltip.ts`, `legend.ts` | The tooltip beside the hovered or focused mark, and the series legend |
| `table.ts` | The data table: its contents from the chart's rows (`tableModel`, pure), and the `<details>` or visually hidden table that shows them, kept by key |
| `announce.ts` | With `announce`, the polite live region and the chart's summary of an update |
| `switch.ts` | `chartSwitch`: views of the same data in one grid cell, one shown at a time, and a switch that plays a transition effect on each pair of marks with the same key in an overlay, moves the labels, fades unmatched marks and the views' other parts, reverses mid-way, and moves focus and announces the new view |
| `adapter/` | `expressive()`: effects on SVG marks drawn by other code. Reading the source (`source.ts`), coordinates through CTMs (`space.ts`), bars from rects (`bars.ts`), the host-mark style handle (`host-style.ts`), the record of every change to the host's DOM, so `destroy()` can undo it (`edits.ts`), `watch`, which hears the host's own attribute changes and hands them on once a frame (`watch.ts`), and `fromVegaView()`, which reads a Vega or Vega-Lite View's marks from its scenegraph and follows its renders (`vega.ts`) |
| `render/` | The drawing API in SVG: `svgSurface` (the runner's surface), `svgLayer`, `svgMarkHandle`; theme tokens and the shared stylesheet; text measurement |
