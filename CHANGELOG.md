# Changelog

Nothing is published yet. Each release will be listed here, newest first. Until then, [docs/plan.md](docs/plan.md) records what each milestone built.

## The 0.x promise

The library follows [semantic versioning](https://semver.org) from 0.1.0, with this promise for the 0.x releases.

**The effect-author API** is:

- `defineEffect` and `defineDataEffect`, with `GeometryEffectSpec` and `DataEffectSpec`;
- `matrix` and `offset`;
- `describe.bar`, `describe.arc`, `describe.line` and `describe.point`, with their specs: `BarSpec`, `BarSegmentSpec`, `Baseline`, `ArcSpec`, `LineSpec` and `PointSpec`;
- the effect contracts (`GeometryEffect`, `DataEffect`, `TransitionEffect`, `MarkEffect`, `AnyMarkEffect`, `Combined`), the contexts (`EffectContext`, `TransitionContext`), the mark and its data (`MarkGeometry`, `Outline`, `Point`, `Rect`, `MarkData`, `Sample`), the drawing API (`Layer`, `MarkHandle`, `MarkStyle`, `Matrix`, `Paint`, `TextStyle`, `Color`, and the handles `IconHandle`, `PathHandle` and `TextHandle`), and icons as an effect gets them (`Icon`, `IconShape`, `IconSource`);
- the motion types the context uses: `MotionView`, `MotionMode`, `Timing`, `Tween`, `TweenOptions`, `TweenResult` and `Easing`;
- `expressive-charts/testing`: `checkEffect`, `checkTransition`, `fixtures`, `fixturePairs`, `testContext` and `play`, with their options (`CheckEffectOptions`, `CheckTransitionOptions`, `TestContextOptions`, `PlayOptions`), the fixtures' names (`FixtureName`, `FixturePairName`), the test context (`TestContext`) and what it records (`RecordingLayer`, `RecordingMark`, `Drawn`, `DrawnIcon`, `DrawnPath`, `DrawnText`, `LayerCall`, `MarkCall`, `Picture`), and the motion types they use: `Motion`, `Clock`, `ManualClock`, `ScalingOverrides` and `ScalingRule`.

That's every type these names use, so code written against them needs nothing outside the list. A test imports every name in it, so none can be renamed or removed by accident.

From 0.1.0:

- **A breaking change to that API comes only in a minor release** (0.1 → 0.2), never in a patch, and this file lists it with a migration note: what changed, and what to write instead.
- **A deprecated name keeps working for one minor release.** It's marked `@deprecated` with its replacement, and removed in the minor release after that.
- Additions (a new optional field, a new helper) can come in any release.

Everything else can still change in a minor release while the library is 0.x: the motion core (`motion`, `createMotion`, the clocks, `tween`, `animated`, `playback`, and the types the list doesn't name), the charts, the adapters, the built-in effects and the controls. Those changes are listed here too. [docs/effects-guide.md](docs/effects-guide.md) is the guide to the author API.

## Unreleased

### Added

- **The effect-author API is public** ([guide](docs/effects-guide.md)). `defineEffect(spec)` and `defineDataEffect<D>(spec)` make an effect from its `run` and `end`: they fill in the kind and a `clear()` that does nothing, throw a `TypeError` without `run` or `end` (every effect needs an end state), and freeze the effect. A data effect's spec is checked against its row type strictly.
- **`expressive-charts/testing`**, a separate entry with the conformance suite. `checkEffect(effect, { marks, icons, data, batch, moved, name })` runs five checks on every mark (a full run ends as `end()` draws; clearing leaves nothing; an abort settles; with motion off no frames run; after a run or `end()`, a `change()` to the mark moved somewhere else leaves what `end()` draws there) and throws one `Error` listing every failure, in any test runner. The fixtures have moved twins for the fifth check; a page's own marks pass `moved(mark)` or skip it. With it: `fixtures` (one of each kind of mark), `testContext` and `play`.
- **`threshold({ compareTo, when, color })`**, the first data effect. It colours the parts of a mark's walk where its values are below a constant or a related series (`when: "above"` for above), in `"negative"` by default, with crossings interpolated between samples. A series is matched by `at` where both have it, else by `t`, and goes in `needs.related`. It draws at once, with no animation, and redraws on every change, so it belongs in `on.decorate`.
- **`samplesAlong(mark, points)`** gives data effects their samples on marks the library didn't draw. It projects each point `{ x, y, value, at? }`, in the marks' coordinates, onto the nearest point of the mark's walk and returns the samples in `t` order; a point on the walk, such as a vertex of the line it drew, lands exactly there. It pairs with `expressive()`'s new `samples` option, and its points' type is `SamplePoint`.
- **`expressive()`'s `watch` option** follows the host's own transitions frame by frame, without `refresh()`. A `MutationObserver` notes the marks' geometry attributes, and `transform` and `style` on their ancestors up to the `<svg>`; once a frame, only the marks that moved are read again (their rows, geometry and samples), and their effects follow with no events. `refresh()`, called when the host joins new data, still fires `enter`, `update` and `exit`. It's opt-in: its cost grows with the number of marks that move each frame.
- **Transition effects are public.** `TransitionEffect`'s `run(from, to, ctx)` and `end(from, to, ctx)` now take a `TransitionContext`: an `EffectContext` with `start`, from 0 to 1, so a run can begin part way and a switch back mid-way retraces. Its `mark` does nothing and its `onChange` never fires, since both views' marks are hidden while a transition plays.
- **`checkTransition(effect, { pairs, icons, name })`** in `expressive-charts/testing` checks a transition effect on pairs of marks, both ways: checks 1 to 4 of `checkEffect`, a run from `start: 0.5`, and that a run back from `start: 1 − p` begins with the picture the run forward draws at p. Its default pairs are `fixturePairs`: a slice and a column, a bar and a column, two slices, two lines and two points.
- **`morph({ points, align })`**, the first transition effect. It samples two closed outlines at `points` (default 160) and moves each point in a straight line to its partner, as one filled path; two lines are sampled along their strokes, their width moving between thicknesses; a closed and an open outline crossfade. `align: "unroll"` matches each side with the same side, and `"drop"` turns the matching by a side from the mark that goes round its pivot, as the lab does, so a slice's outer arc meets a column's top. The default is `"unroll"`, picked by comparing the two in the morph demo. 950 ms base with `transition` timing, eased in and out; a run from `start` takes the rest of the time.
- **`chartSwitch(target, { views, initial, transition, colors, announce })`** shows views of the same data in one place, one at a time, and turns each mark into the mark with its key in the next with a transition effect, `morph()` by default. Each view is a function that draws its chart in the container it's given, with the switch's `ColorAssignment`. Labels move between their places and swap their text half way, unmatched marks fade, and the old view's other parts fade out as the new one's fade in. A `show()` back mid-way reverses from where the shapes are. Only the shown view can be seen, reached or read, focus on a mark follows its key, and `announce` says the new view's label. It returns `{ show(view), current, chart(view), destroy() }`.
- **`fromVegaView(view, options)`** attaches effects to a Vega or Vega-Lite chart rendered as SVG. It reads the named mark (`mark`, Vega-Lite's `"marks"` by default) from the View's scenegraph: rects are bars (stacks too), arcs slices, symbols points and lines lines. `sample(row)` gives data effects each item's value and `at`. It takes `expressive()`'s other options, and follows the View's own renders, new data or a resize, with no `refresh()` to call. Duck-typed on the View: the library imports nothing from Vega, which stays a dev dependency.

### Changed

- `matrix` and `offset` are no longer experimental.
- `sequence` starts each part on the mark's geometry and data as they are when that part starts, not as they were when the sequence started, so a part after a travel follows a line that grew meanwhile.
- `expressive()`'s hovered mark under `dim: true` takes its strong colour as our charts' marks do: its colour stepped a quarter of the way toward `--ec-text` (in OKLab), so lighter in the dark theme rather than mixed with black in both. `emphasis` on host marks mixes toward the same colour.
- `expressive()` reads a `<rect>` through its parent's coordinates and its own `transform` attribute, no longer through its own screen CTM, so the CSS transform an effect gives a bar is never read back as geometry. A CSS transform a host puts on the rect element itself isn't seen either (on its groups, it still is).
- `onChange` listeners in the `update` slot get data that keeps the previous values the run was given, so `stagger` and `sequence` no longer drop them when they start an effect on the latest data.
- **CommonJS gets its own types.** Each entry's `require` condition points at `.d.cts` declarations, so a CommonJS project resolving with `node16` is given CommonJS types for the `.cjs` file it loads. `import` keeps the `.d.ts` files.
- The package includes this changelog, where the promise is.
- The types need TypeScript 5.4 or newer, since they use `NoInfer`.
- The 0.x promise names every type its names use, and says that the motion core is outside it.
