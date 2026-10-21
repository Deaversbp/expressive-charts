# charts

Chart components (bar, line, donut, and later more). Each chart gives every mark a stable key, describes it with `MarkGeometry`, and emits `enter`, `update`, `exit`, `hover` and `leave` events. Charts import only from core and never name a specific effect: the composition root (`src/index.ts`) hands them the preset and icon registries as a `ChartEnv`.

| File | What it holds |
| --- | --- |
| `bar.ts` | `barChart`: DOM, hover and keyboard focus, staged and interruptible updates, resizing, and the runner wiring |
| `bar-layout.ts` | The bar chart's layout, pure: encoding, sorting, the nice scale, the frame (scale and bands), and `placeRow` / `placeTick`, which draw a laid-out row or any state in between |
| `types.ts` | What charts share: options, `MarkEvent(s)`, `Chart`, accessors |
| `colors.ts` | `colorAssignment`: palette slots that follow the entity |
| `motion.ts` | A chart's motion from its `motion` option |
| `keyboard.ts` | Keyboard focus: the roving tabindex, arrow keys, Home, End and Escape, and whether focus followed a key press |
| `interaction.ts` | Pointer and touch hover, delegated from the `<svg>` |
| `render/` | The drawing API in SVG: `svgSurface` (the runner's surface), `svgLayer`, `svgMarkHandle`; theme tokens and the shared stylesheet; text measurement |
