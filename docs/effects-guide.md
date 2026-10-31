# Writing effects

An effect is a small piece of motion that runs on one mark: a ball rolling out a bar, a halo that blinks, a label that rises into place. The library's own effects (`travel`, `flash`, `wiggle`, `pulse`, `trace`, `drawIn`, `threshold`, `delta`, `label`) are written against the same API this guide describes, and so can yours. An effect written this way runs on every chart: the library's bar, donut and line charts, SVG charts drawn by D3 or Observable Plot through `expressive()`, and Vega or Vega-Lite charts rendered as SVG, through `fromVegaView()`.

This guide covers the contract an effect reads, the drawing API it writes through, how it keeps time, the rules that keep charts readable, data effects, composing, testing with `checkEffect`, and transition effects, which play between two views of a mark, with `checkTransition`. It ends with two worked examples and a review checklist.

**Stability.** The author API is public, under the 0.x promise in [CHANGELOG.md](../CHANGELOG.md): from 0.1.0, a breaking change to it comes only in a minor release (0.1 → 0.2), with a migration note, and a deprecated name keeps working for one minor release. The API is `defineEffect`, `defineDataEffect`, `matrix`, `offset`, `describe.*`, the effect, context and drawing contracts described here, and `expressive-charts/testing`.

## A first effect

```ts
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

- `run(mark, ctx)` animates. It resolves when it's done or cancelled.
- `end(mark, ctx)` draws, at once, what a full run ends with. Reduced motion shows only this.
- `ctx.onChange` hands both the mark's new geometry whenever it moves (a resize, a transition), so the underline stays on the bar.
- `defineEffect` fills in `kind: "geometry"` and a `clear()` that does nothing, throws a `TypeError` if `run` or `end` isn't a function, and freezes the effect. Only `run`, `end` and `clear` are kept.

The effect never asks what chart it's on. It reads the mark's walk (`mark.slice`), so the same underline runs along a bar, around a donut slice and along a line.

## The mark: `MarkGeometry`

Every mark, whoever drew it, is described with the same shape. It has two parts.

**The walk**, from where the data starts to where it ends:

| Field | What it is |
| --- | --- |
| `start`, `end` | `path(0)` and `path(1)` |
| `length` | the walk's length in px; 0 for a point |
| `path(t)` | the point at `t` in [0, 1], by distance: `t = 0.5` is halfway along on screen |
| `angle(t)` | the direction of travel at `t`, in radians |
| `slice(t0, t1)` | SVG path data for that part of the walk, less its gaps |
| `gaps` | optional: the stretches with no data, as `[from, to]` values of `t`, in order ([below](#drawing-along-a-walk-with-gaps)) |

**The body**:

| Field | What it is |
| --- | --- |
| `thickness` | px across the walk: a bar's height, a ring's width, a stroke's width, a marker's diameter |
| `outline` | the shape's path data (`d`), whether it's an area (`closed`), and `sample(n)` |
| `bounds`, `center` | the bounding box and the visual centre |
| `pivot` | where the mark is attached to the chart: a bar's baseline, a donut's centre, a line's first point |
| `segments` | a stack's parts in order from the baseline, each a `MarkGeometry` with its `series`; every bar has at least one |
| `labelBounds` | optional: the boxes of the text the chart draws for the mark, so your own text can keep clear of them |
| `nearbyLabels` | optional: the boxes of other marks' text near this one, which your text should keep clear of too |
| `key`, `series` | the mark's stable identity, and its series if it has one |

What each kind of mark gives:

| | Bar | Donut slice | Line | Point |
| --- | --- | --- | --- | --- |
| Walk | middle of the baseline edge → middle of the tip | start angle → end angle, on the mid-radius arc | first point → last point | none: length 0, at the point |
| `pivot` | middle of the baseline edge | the donut's centre | the first point | the point |
| `segments` | at least one | none | none | none |
| `labelBounds` | its category and value labels | its label outside the ring, or none when it's dropped | its end label | none (unset) |
| `nearbyLabels` | none (unset) | every other slice's label | every other line's end label | none (unset) |

A mark the library didn't draw has no `labelBounds` or `nearbyLabels` unless the page's `geometry` gives them, so an effect that reads them needs a fallback: past the end of the walk, say.

**Keeping your text clear of labels.** An effect that writes text near a mark should keep it off the mark's own labels and off other marks' near it. Pick where it goes from `labelBounds` alone, as the built-in `delta` and `label` do: along the walk past the end, or out from the mark through its own label. Then go past every box that way meets in both lists, `labelBounds` and `nearbyLabels`, so a neighbour's label pushes your text further along but never turns it. Two lines that end close together then each put their text past both end labels, not on the other's. Text centred on a point reaches out to either side, so measure "past" a box by its top or bottom, not by the side the way leaves it through, or better, by your text's own box (below).

**Keeping your text clear of other effects' text.** Your effect sees only its own mark, but `ctx.texts` (a [`TextSpace`](api.md#textspace)) knows where other effects' text sits on the same chart. `box(content, style)` measures your text as the chart measures its labels, `held()` gives the boxes of the runs that started before yours, and `hold(box)` tells the runs after yours where your text is. Place your text clear of `held()` as you place it clear of labels, then hold where it ends:

```ts
/** Whether boxes `a` and `b` come within `gap` px of each other. */
const near = (a: Rect, b: Rect, gap: number): boolean =>
  a.x < b.x + b.width + gap && b.x < a.x + a.width + gap && a.y < b.y + b.height + gap && b.y < a.y + a.height + gap;

/** 10 px past the end of the walk, then on, 2 px at a time, until the text is 6 px clear of the text held before it. */
function placeText(mark: MarkGeometry, ctx: EffectContext, content: string): TextStyle {
  const heading = mark.angle(1);
  const at = (distance: number): TextStyle => ({ at: offset(mark.end, heading, distance), anchor: "start" });
  const held = ctx.texts?.held() ?? [];
  let distance = 10;
  while (ctx.texts && held.some((box) => near(ctx.texts!.box(content, at(distance)), box, 6))) distance += 2;
  ctx.texts?.hold(ctx.texts.box(content, at(distance)));
  return at(distance);
}
```

Do it on every draw, in `run()`, `end()` and `onChange`: the runner calls `onChange` again when text held before yours moves, though your mark didn't, so your text can follow it. Runs start in the chart's mark order, so the first mark's text keeps its place and the next goes past it; yours never moves another's. The runner lets go of your box when the run is cleared. `texts` can be unset, on a context someone else built: then no other text is known. `testContext({ held })` gives your tests boxes held before, and `ctx.texts.holding` what your effect holds.

**Conventions** ([architecture.md](architecture.md#conventions) has them all):

- **Space.** Chart pixels, origin at the top left, y pointing down. The overlay you draw in uses the same space.
- **Angles** are screen angles: 0 along +x, positive turning clockwise, in (−π, π]. A bar growing right has angle 0, a column −π/2, a negative bar π.
- **Up side.** "Up" is the left of the direction of travel, `angle − π/2`: screen up for a bar growing right, outward for a donut slice walked clockwise. Put decorations on the up side and they sit the right way round on every mark.
- **Outline sampling.** A closed outline's `sample(n)` (n a multiple of 4) gives n/4 points per side, clockwise from the start-left corner. An open one (a line) gives n points along the stroke.
- **Missing and zero.** A series that isn't shown has no segment; a zero value has a segment of length 0. Treat both the same: a walk under 0.5 px should finish at once and draw nothing.
- **Never branch on the kind of chart.** There is no `mark.type`, on purpose. If an effect needs something the contract doesn't give, the contract is missing it: open an issue rather than guessing from the shape.

`describe.bar`, `.arc`, `.line`, `.point` and `.shape` build marks by hand, for tests or for `expressive({ geometry })`. `describe.shape` reads any SVG path data, so a curve or an area another library drew is a mark too ([below](#on-a-curve-or-an-area)).

### Drawing along a walk with gaps

A line that skips a value has a gap in its walk, from the value before to the value after: `mark.gaps`, as `[from, to]` values of `t`. The walk runs straight across a gap, so `path(t)` and `angle(t)` work there as anywhere, but there's no data there, and the line's stroke leaves it out.

- **Draw along the walk with `slice(t0, t1)`.** It leaves the gaps out, with a move across each, so a stroke drawn with it has the line's own gaps. A path you build yourself from `path(t)` would draw across them.
- **Put things on the walk outside the gaps.** An icon or a label placed at `path(t)` for a `t` inside a gap sits where there's no data. `travel` jumps from one side of a gap to the other; check `mark.gaps` before you place something at a `t` of your own.
- **`outline.sample(n)` runs along the whole walk**, gaps and all, so a morph between two lines joins across their gaps part way.
- **In data, a gap is `gapBefore`:** `true` on the first sample after it. Don't interpolate between a sample with `gapBefore` and the one before.
- Most marks have no gaps: `mark.gaps` is unset, and `slice()` is the whole stretch. A line described with `describe.line({ points, breaks })` has them, `breaks` being the indices of the points that start a new run. So does an open shape from `describe.shape` with more than one move, as d3 draws a line with `.defined()`.

```ts
// The stroke so far, with the line's gaps left out.
path.update(mark.slice(0, progress));

// Whether a place along the walk is in a gap, where there's no data to put anything on.
const inGap = (mark: MarkGeometry, t: number): boolean => (mark.gaps ?? []).some(([from, to]) => t > from && t < to);
```

The `fixtures` include a `"gapped line"`, so `checkEffect` runs your effect on a mark with a gap by default.

## The context and drawing API

Each run gets its own context. Everything an effect touches goes through it.

| Field | What it is |
| --- | --- |
| `signal` | aborted on leave, re-trigger, data update or destroy |
| `tween(options)` | a tween with the clock, the motion mode and the signal already bound ([Timing](#timing)) |
| `motion` | the motion view: `mode`, `staged`, `duration(base, timing)` |
| `layer` | this run's own overlay group, above the marks |
| `mark` | restyles the mark itself |
| `icons` | looks icons up by name: `ctx.icons.get("dot")` |
| `batch` | `{ index, count }`: this mark's place among the marks of one event, for `stagger` |
| `onChange(listener)` | called with the new geometry (and data) whenever the mark moves: a transition, a resize |
| `previous` | the geometry before this update, on `update` events |
| `texts` | where effects' text sits on this chart: `box()`, `held()` and `hold()` ([above](#the-mark-markgeometry)); unset when no other text is known |

**The overlay** (`ctx.layer`):

- `layer.path(d, paint)` draws a path, unfilled unless `paint.fill` is given. `paint` is `{ fill, stroke, width, opacity, linecap, part }`. The handle's `update(d, paint?)` replaces the path and merges the paint fields given.
- `layer.text(content, { at, anchor, color, opacity })` draws text with `at` on its baseline, in the theme's text colour by default. `update(style, content?)` merges the style fields given.
- `layer.icon(icon, { size })` draws an icon, hidden until its first `place(transform)`. The icon is scaled by `size / icon.size` about its anchor before `place()`, so build the transform as if the icon were its natural size.
- Every handle has `remove()`.

**The mark** (`ctx.mark`):

- `mark.set({ transform, opacity, emphasis, halo })` changes only the fields given, so effects running in parallel don't undo each other. A field given as `undefined` goes back to the mark's own.
- `transform` and `opacity` apply to the mark's body; its labels and pointer target stay put. The paths and icons you draw in the overlay take the mark's `transform` too, so they stay on a mark that another effect turns. Your text stays put, as the mark's labels do. `emphasis` (0–1) mixes toward the series' strong colour. `halo: { width, opacity, color? }` strokes the outline behind the mark, half of `width` showing outside.

**Colours** are theme tokens or any CSS colour: `"text"`, `"text-muted"`, `"surface"`, `"negative"`, `"series-3"`, `"series-3-strong"`, and `"mark"` / `"mark-strong"` for this mark's own colours. Text uses text colours, never series colours.

**A segment's colour.** A stack's `"mark"` is its first segment's. To draw one segment in its own colours, name it in the paint with `part`, its key (`segment.key`, such as `"Okafor/assists"`): in that paint, `"mark"` and `"mark-strong"` are that segment's. Unset, or a key the mark hasn't, they're the mark's own, so a line or a slice, which has no segments, draws in its colour either way. The built-in [`drawIn`](api.md#drawin) draws a stack part by part this way:

```ts
// Each part along its walk, at its width, in its own colour.
for (const part of mark.segments ?? [mark]) {
  ctx.layer.path(part.slice(0, 1), { stroke: "mark", width: part.thickness, ...(mark.segments && { part: part.key }) });
}
```

**Geometry helpers.**

```ts
import { matrix, offset } from "expressive-charts";

matrix.rotate(radians, about?);  // positive turns clockwise on screen, like SVG's rotate()
matrix.translate(x, y); matrix.scale(sx, sy?, about?);
matrix.multiply(a, b, c);        // like the SVG transform list "a b c": c applies first
matrix.apply(m, point);
offset(mark.end, mark.angle(1) - Math.PI / 2, 8); // 8 px to the up side of the tip
```

A `Matrix` is `[a, b, c, d, e, f]` in SVG order.

## Timing

Every duration goes through `ctx.tween`:

```ts
const t = ctx.tween({ duration: 400, timing: "effect", ease, delay, update: (p) => { /* draw at eased progress p */ } });
await t.finished; // "done" or "cancelled"; never rejects
```

- **`duration` and `delay` are base values.** The motion mode scales them by `timing`. Use `"effect"` for an effect's own motion: the base in Presentation, ×0.35 within 140–300 ms in Analysis, and 0 when the effective mode is Off. Use `"stagger"` only for waiting a mark's turn: the base in Presentation, 0 in Analysis and Off.
- With a duration scaled to 0, `update(1)` runs before `tween` returns, so the same code draws the end state with motion off.
- Aborting the run cancels its tweens; `finished` then resolves to `"cancelled"`.
- `update` gets eased progress: `ease(0)` at once, then every frame, then `ease(1)`. The default ease is `easeInOutCubic`; `easeOutCubic` and `linear` are exported too, and any `(t) => number` works.
- **Never use `setTimeout`, `setInterval`, `requestAnimationFrame` or `Date.now()`.** They escape the motion mode and reduced motion, keep going after an abort, and can't be tested on a manual clock.
- Keep it short. Nothing may loop, and an effect should end well within 5 s even when a page scales its motion up (`pulse` drops repeats that would end later), so it never needs a pause control (WCAG 2.2.2).

## End states

`end(mark, ctx)` draws, at once and on a fresh context, the picture a full run ends with. The runner calls it instead of `run()` when the effective mode is Off (the page chose Off, or the viewer's device asks for reduced motion and they haven't picked a mode on the page), and when motion turns off mid-run. So:

- **A full run and `end()` must leave exactly the same thing**: the same overlay items with the same fields, and the same mark style. `checkEffect` compares them as data, so if the run's last frame sets `opacity: 1`, set it in `end()` too: an opacity of 1 and no opacity look alike but don't compare alike.
- **Information stays.** An effect that tells the viewer something (a delta label, a threshold colour) must show it in its end state, or reduced motion never shows it. `delta` below rises into place and stays rather than fading out.
- **Emphasis may end with nothing.** `flash` and `pulse` end with nothing drawn, because the change they point at stays on the chart anyway.

## Keeping data readable

Effects add personality or explain a change. They never misstate the data:

- **Decorations go in the overlay** (`ctx.layer`) or the halo. Icons, labels and strokes sit on top and leave the mark as it is.
- **Changes to the mark itself stay small and bounded.** `wiggle` turns a mark so no point of its outline moves more than 3 px, about its pivot, and ends with no transform. `pulse` only sets the halo: it never scales a mark, which would make a value look bigger than it is. Don't move, resize or hide a mark while it's being read, and don't fade it out to make room for a decoration.
- **Hover feedback is quick** (about 100 ms) and nothing should move under the cursor in a way that hides data. The chart dims the other marks itself, with the paths and icons drawn for them; text keeps its contrast.
- Validate options when the effect is made, with a `RangeError` that names the option, so a bad `swing` fails at once rather than mid-animation.

## Effects are stateless

One effect object runs on many marks at once: every bar in a batch, several charts, the same slot again after a re-trigger. So keep per-run state in `run`'s own variables, never in the factory or the module:

```ts
// Wrong: one stroke shared by every mark the effect runs on.
const bad = () => {
  let stroke: PathHandle | undefined;
  return defineEffect({ async run(mark, ctx) { stroke = ctx.layer.path(/* … */); /* … */ }, end() {} });
};
```

Options captured when the effect is made (a colour, a width) are fine: they never change. `defineEffect` freezes the effect for this reason.

The runner owns each run's lifecycle, so an effect stays small:

- **One run per mark and slot.** A re-trigger clears the previous run first.
- **Clearing** aborts `ctx.signal`, calls the effect's `clear(ctx)`, empties the layer, resets the mark's style and drops `onChange` listeners, even if the effect forgets. `clear()` is only for cleanup beyond that, which is rare.
- **A finished run stays** until it's cleared: a ball that rolled to the end rests there while the pointer stays.
- **Abort means stop.** After `ctx.signal` aborts, draw nothing more and resolve; don't reject. Awaiting `ctx.tween(...).finished` already does this, and a loop should check `ctx.signal.aborted` between steps.
- **Geometry moves.** A run in the `update` slot plays while the chart transitions, a resize can come at any time, and a line grows as it's revealed. To stay attached, redraw from `onChange(mark => …)`, as `travel`, `wiggle` and `threshold` do. Do it in `end()` too: with motion off the runner draws `end()` instead of running, and the mark still moves. `checkEffect` checks both.

## Data effects and `needs`

A data effect also reads the mark's data. Use `defineDataEffect<D>`, where `D` is the chart's row type:

```ts
import { defineDataEffect } from "expressive-charts";

interface Region { region: string; revenue: number; target: number }

const belowTarget = defineDataEffect<Region>({
  async run(mark, data, ctx) {
    if (data.datum.revenue >= data.datum.target) return;
    await ctx.tween({ duration: 300, timing: "effect", update: (p) => ctx.mark.set({ emphasis: p }) }).finished;
  },
  end(_mark, data, ctx) {
    if (data.datum.revenue < data.datum.target) ctx.mark.set({ emphasis: 1 });
  }
});
```

`data` is a `MarkData<D>`:

| Field | What it is |
| --- | --- |
| `datum` | the row behind the mark: a bar's or a slice's row, a line point's row, and for a line the row at its revealed end |
| `samples` | values along the walk, `{ t, value, at?, gapBefore? }`, t ascending, with `gapBefore` on the first after a gap: on `barChart`, from 0 at the baseline to the total at the tip; on the donut, from 0 to the slice's share; on `lineChart`, one per revealed value with its x as `at`, plus the end part way to the next row, a missing value left out with `gapBefore` on the value after it, and a point's one value. On `expressive()`, the page's `samples` option (`samplesAlong` gives a host's line its own from the points that drew it), or without it the bar chart's samples on rects with a numeric `value`, and none on other marks |
| `related(series)` | another series of the same mark or chart, as `MarkData`, if there is one |
| `previous` | the values before this update, in the `update` slot |

- **Row types are checked.** An effect for `Region` rows is a type error on a chart of other rows, and combining it with a generic effect doesn't hide that. An effect that reads no row fields is `defineDataEffect({ … })`, with `D` left as `unknown`, and fits any chart.
- **`needs: { related: ["xg"] }`** lists the series the effect reads through `related()`. A chart without them throws when it's created, instead of the effect silently drawing nothing, and so does an `expressive()` attachment whose marks don't have them, when it's made or refreshed.
- Keep the distinction: an effect that only needs geometry should be a geometry effect, so it runs everywhere, including on host marks with no data.
- `onChange(listener)` passes the mark's latest data as its second argument, so an effect that reads values can follow them as they change (a line being revealed). In the `update` slot it keeps `previous`. It can be undefined; keep the data you had.

### `threshold`, the built-in data effect

```ts
import { barChart, only, threshold } from "expressive-charts";

// The part of each bar past a 10-goal target, across the bar's full thickness.
const pastTarget = threshold({ compareTo: 10, when: "above", color: "series-1-strong" });
barChart("#goals", { label: "Goals by player", data: players, y: "name", x: "goals", on: { decorate: pastTarget } });

// A related series instead of a number: the goals line in the negative colour wherever it's below xG.
const belowXg = only("goals", threshold({ compareTo: "xg" }));
```

- **What it draws.** One overlay path per run of the walk where the mark's values are below `compareTo` (or above it, with `when: "above"`): `mark.slice(t0, t1)`, stroked in `color` (default `"negative"`) at the mark's `thickness` with butt caps, so a coloured part ends exactly where the values cross. Equal values aren't coloured, and a walk under 0.5 px, such as a point, draws nothing.
- **What it compares.** A number is compared with every sample as it is. A series' name goes in `needs.related`, so a chart without that series throws when it's created. The series is matched by `at` when every sample of both has a number or a `Date` there, the reference interpolated between its samples and nothing coloured outside its range; otherwise by `t`.
- **Crossings** are interpolated linearly in `t` between neighbouring samples, and between the places where the reference bends. That's exact where the walk is straight between samples: bars, our lines, and a host polyline sampled at its vertices. Along a curve, values aren't linear in distance, so a crossing between two samples is approximate; denser samples narrow the error.
- **Gaps.** Nothing is interpolated across a sample with `gapBefore`, the mark's or the reference's: where either has no value, nothing is coloured.
- **An encoding, not motion.** It draws at once, with no tween, because a fade would flicker as a line extends. It redraws on every `onChange`, with the latest data, so it follows a mark that moves and a line as it's revealed. `end()` draws the same picture, so the colour shows with motion off. Put it in `on.decorate`, which runs from enter until the mark exits.
- `compareTo` must be a finite number or a non-empty series name, `when` `"below"` or `"above"`, and `color` a non-empty string, or it throws a `RangeError` when it's made.

What it compares on each chart, from the samples the chart gives:

| Chart | `samples` | `related(series)` |
| --- | --- | --- |
| `barChart` | 0 at the baseline to the bar's total at the tip, so `compareTo: 10` colours the part past 10 | that series' segment of the stack, with samples over the segment's own walk |
| `donutChart` | 0 to the slice's share of the total, so `compareTo: 0.25, when: "above"` colours the part past a quarter | its own series only |
| `lineChart` | a line's value at each revealed row, with the row's x as `at`, plus its end part way to the next row, so `compareTo: "xg"` colours the goals line below xG and follows every frame of a reveal. Where either line is missing a value, nothing is coloured. A point has its one value, and draws nothing | the other line; for a point, the other series' point at the same x |
| `expressive()` | the page's `samples` option: on a D3 line, `samplesAlong` on the points that drew it, so `compareTo: "xg"` colours it below the xG line. Without it, rects with a numeric `value` get `barChart`'s samples, circles with one get it as their one sample, and other marks none, so it draws nothing | the mark's own segment of that series, else the first other mark of that series (another line path) |

## Composing

Small effects put together beat one large, configurable effect:

```ts
import { only, parallel, sequence, stagger } from "expressive-charts";

sequence(travel(soccerBall, { along: "goals" }), travel(cleat, { along: "assists" })); // one after the other
parallel(flash(), underline);         // together; done when both are
only("revenue", underline);           // on marks whose key or series is "revenue" (or a predicate)
stagger(pulse({ times: 1 }));         // each mark of a batch a little after the one before
```

- Parts share the run's context: one overlay group, one mark handle (whose `set()` merges fields) and one signal. A sequence starts each part on the mark's geometry and data as they are by then. A part with nothing to do should finish at once, so one `sequence` tells the whole story whatever the chart shows.
- A combination is a data effect if any part is one, and it needs every part's rows and related series.
- `stagger` is never a default: research finds it helps little and can hurt. Its waits use `"stagger"` timing, so nothing waits in Analysis or Off.
- `registerPreset("underline", () => underline)` makes an effect usable by name in any chart's `on`.

## Testing with `checkEffect`

`expressive-charts/testing` has the conformance suite the library's own effects pass. It imports no test runner: `checkEffect` resolves when every check passes, and otherwise rejects with one `Error` that lists every failure, so it works in Vitest, Jest, `node:test` or Mocha.

```ts
import { checkEffect } from "expressive-charts/testing";
import { delta } from "./delta";
import { trace } from "./trace";

test("trace and delta are good effects", async () => {
  await checkEffect(trace());
  await checkEffect(delta());
});
```

On every mark, it checks that:

1. a full run ends with the same picture and mark style as `end()`;
2. clearing leaves nothing drawn, the mark's own style, and nothing still running;
3. an abort mid-run settles the run (it resolves, without more frames) and clears to nothing;
4. with motion off, no frames run and the run draws what `end()` draws;
5. after a full run, and after `end()`, a `change()` to the mark moved somewhere else leaves what `end()` draws there, so an effect that should stay attached follows `onChange`.

A failure reads like this:

```
checkEffect found 27 problems with delta:
- on the bar, a full run should end with the same picture and mark style as end(): item 1 drawn after the run is {"kind":"text","content":"+1","style":{"at":{"x":210,"y":10},"anchor":"start","opacity":1}} but end() draws {"kind":"text","content":"+1","style":{"at":{"x":210,"y":10},"anchor":"start"}}
- on the bar, with motion off, no frames should run and the end state should be drawn: item 1 drawn after the run with motion off is …
- on the bar, a change() to the moved mark should leave what end() draws on it: item 1 drawn after a full run and a change() is {"kind":"text","content":"+1","style":{"at":{"x":210,"y":10},"anchor":"start","opacity":1}} but end() draws {"kind":"text","content":"+1","style":{"at":{"x":170,"y":40},"anchor":"start"}}; item 1 drawn after end() and a change() is …
- on the negative bar, …
```

Options:

| Option | What it does | Default |
| --- | --- | --- |
| `marks` | the marks to check on: named (`{ bar, slice }`), or a list such as `chart.marks()`, named by key | `fixtures` |
| `icons` | icons the effect looks up by name through `ctx.icons` | none |
| `data` | `(mark) => MarkData`, for data effects | no datum, values from 0 to 1, no related series |
| `moved` | `(mark) => MarkGeometry \| undefined`: the same mark (same key) moved, for check 5; undefined skips it on that mark | each fixture's moved twin; nothing for other marks |
| `batch` | `{ index, count }`, for effects that read `ctx.batch` | the only mark |
| `name` | what the report calls the effect | "the effect" |

- `fixtures` are one of each kind of mark: `bar`, `negative bar`, `column`, `stacked`, `short bar`, `slice`, `line`, `gapped line` (the line with a gap after its second point) and `point`. Each has a moved twin for check 5, with the same key and series, somewhere else and another size.
- A data effect typed for its own rows needs `data` that gives them (a type error otherwise), and so does one that `needs` related series (checkEffect throws otherwise).
- On real marks: `checkEffect(effect, { marks: chart.marks() })`, in a DOM environment such as jsdom. Check 5 needs the marks moved: draw them again at another size and pass `moved: (mark) => resized.marks().find((m) => m.key === mark.key)`, or it's skipped.
- With a data effect, check 5 gives `change()` and `end()` the moved mark's data, `data(moved)`.

For your own tests, `testContext({ mode, scaling, icons, batch, previous })` is a complete context on a manual clock, with `abort()`, `clear()` (the runner's cleanup) and `change(mark)` (calls `onChange`). Its `layer` and `mark` record what's drawn: `layer.picture()` gives it as plain data, rounded, and `mark.style` the mark's style. `play(ctx.clock, running)` advances the clock a frame at a time until the run settles:

```ts
import { fixtures, play, testContext } from "expressive-charts/testing";

const ctx = testContext();
await play(ctx.clock, trace().run(fixtures.bar, ctx));
expect(ctx.layer.picture()).toEqual([{ kind: "path", d: fixtures.bar.slice(0, 1), paint: { stroke: "mark", width: 3, opacity: 0.5, linecap: "round" } }]);
```

### On a curve or an area

The fixtures are made of straight pieces and circular arcs. To check an effect on a curve or an area, describe one from the path data that draws it, with `describe.shape`, and pass it in `marks`, with a moved twin for check 5:

```ts
import { area, curveMonotoneX, line } from "d3-shape";
import { describe } from "expressive-charts";
import { checkEffect } from "expressive-charts/testing";
import { trace } from "./trace";

const weeks = [0, 1, 4, 6, 6, 7].map((goals, i) => ({ week: i + 1, goals }));

/** A curve, the same with week 3 missing, and the area under it, at a scale. */
function shapes(scale: number) {
  const x = (w: (typeof weeks)[number]): number => 80 * scale * (w.week - 1);
  const y = (w: (typeof weeks)[number]): number => 200 - 30 * scale * w.goals;
  return {
    curve: describe.shape({ key: "curve", d: line(x, y).curve(curveMonotoneX)(weeks)!, width: 2 }),
    gapped: describe.shape({ key: "gapped", d: line(x, y).defined((w) => w.week !== 3).curve(curveMonotoneX)(weeks)!, width: 2 }),
    area: describe.shape({ key: "area", d: area(x, 200, y).curve(curveMonotoneX)(weeks)! })
  };
}

test("trace works on curves and areas", async () => {
  const moved = shapes(0.8);
  await checkEffect(trace(), { marks: shapes(1), moved: (mark) => moved[mark.key as keyof typeof moved] });
});
```

- **A curve** is flattened into straight pieces within 0.1 px of it, so an effect sees it as a line with many short legs: `angle(t)` turns a little at each.
- **An open shape with more than one move**, such as the curve drawn with `.defined()`, has a gap at each later move, which your effect should leave alone, as on the `gapped line` fixture ([above](#drawing-along-a-walk-with-gaps)).
- **An area is closed** and has no direction, like a point: its walk has length 0, at its centre. So `trace` and `travel`, which go along the walk, draw nothing on it, and an effect that works on the outline, as `pulse` does, follows its whole path, holes too.

## Transition effects and `checkTransition`

A transition effect plays between two views of one mark, as `morph` turns a donut slice into a column. Where a mark effect gets one geometry, it gets two: `run(from, to, ctx)` turns `from` into `to`, `end(from, to, ctx)` draws the final state at once, and `clear(ctx)` cleans up. It never goes in a chart's `on`; `chartSwitch` plays it on each pair of marks with the same key, in an overlay above both views. There's no definer: it's a plain object of kind `"transition"`.

```ts
import { linear, type Point, type TransitionEffect } from "expressive-charts";

/** a moved toward b by p, weighted on both sides so a run back lands on the same numbers. */
const between = (a: Point, b: Point, p: number): Point => ({ x: a.x * (1 - p) + b.x * p, y: a.y * (1 - p) + b.y * p });

/** A dot that slides from one mark's centre to the other's. */
const slide: TransitionEffect = {
  kind: "transition",
  async run(from, to, ctx) {
    const dot = ctx.layer.text("•", { at: between(from.center, to.center, ctx.start) });
    const progress = (k: number): number => ctx.start + (1 - ctx.start) * k;
    await ctx.tween({ duration: 600 * (1 - ctx.start), ease: linear, update: (k) => dot.update({ at: between(from.center, to.center, progress(k)) }) }).finished;
  },
  end(_from, to, ctx) {
    ctx.layer.text("•", { at: to.center });
  },
  clear() {}
};
```

Its context is a `TransitionContext`: the `EffectContext` above, with `start`.

- **`start`**, from 0 to 1, is where the run begins in the effect's own progress. A switch back mid-way plays the reverse pair from `1 − p`, where p is the progress the switch had reached, so begin with the shapes there and take the rest of the time. An effect that ignores `start` replays from its beginning, and the switch back jumps.
- **The switch's schedule.** An effect can't tell the switch how far it has got, so [`chartSwitch`](architecture.md#switching-between-charts) keeps its own progress, on `morph`'s schedule: 950 ms base with `"transition"` timing, eased with `easeInOutCubic`, and from `start` the rest of a full run's time (from the time where the ease reaches `start`). It moves the labels, fades the other marks and parts, and works out p for a switch back on that schedule. An effect that keeps to it stays in step with all of that and reverses with no jump. One with other timing, such as `slide` above (600 ms, linear), still plays, and the switch lands once it ends too, but its shapes run ahead of the labels, and a switch back starts it from the switch's p rather than its own.
- **Retrace.** A run from b to a at `1 − p` should draw exactly what the run from a to b drew at p. So pair the two shapes by their geometry, never by which one is `from` (morph's `"drop"` turns from the mark that goes round its pivot, whichever it is); draw items in an order that doesn't depend on it either (morph's crossfade always puts the area below the stroke); and weight both sides, `a·(1 − p) + b·p`, so the numbers round alike both ways.
- **`mark` does nothing, and `onChange` never fires.** Both views' marks are hidden while a transition plays, and a resize lands it at once rather than moving its shapes. Draw only in `ctx.layer`.
- **The end state is `to`.** Draw it as the real mark looks, since the switch clears the overlay and shows the real mark when the run ends.
- **Timing.** A switch is a data transition, not a decoration, so use `"transition"` timing (the default): ×1 in Presentation, at most 200 ms in Analysis, a jump in Off. `morph` takes 950 ms base.

`checkTransition` checks one on pairs of marks, from a to b and from b to a:

```ts
import { checkTransition } from "expressive-charts/testing";

test("slide is a good transition", async () => {
  await checkTransition(slide);
});
```

On every pair, both ways, it runs checks 1 to 4 of `checkEffect` (check 5 doesn't apply, since `onChange` never fires) and a run from `start: 0.5`, which should end as `end()` draws. Then it checks that the effect retraces: at p = 0.25, 0.5 and 0.75, a run from b to a from `start: 1 − p` must begin, before its first frame, with the picture a run from a to b begins with from `start: p`. An effect that ignores `start` fails it:

```
checkTransition found 5 problems with replay:
- on the slice and column, a run back should retrace the run forward: the run from b to a from start: 0.75 begins with item 1 unlike the run from a to b from start: 0.25: its style is {"at":{"x":10,"y":75}}, not {"at":{"x":240.742,"y":129.632}}
- on the bar and column, …
```

| Option | What it does | Default |
| --- | --- | --- |
| `pairs` | the pairs to check on, each `[a, b]`: named (`{ "slice and column": [slice, column] }`), or a list, named by the marks' keys | `fixturePairs` |
| `icons` | icons the effect looks up by name through `ctx.icons` | none |
| `name` | what the report calls the effect | "the effect" |

- `fixturePairs` are a slice and a column (a mark that goes round its pivot and one that doesn't), a bar and a column, two slices, two lines and two points. The second of two alike is the first's moved twin.
- For your own tests, a transition's context is a test context with `start`: `const ctx = { ...testContext(), start: 0.5 }`.

## Worked examples

Both are in [docs/sketches/examples/effects](sketches/examples/effects/), where `npm run typecheck` checks them against the real API, and both pass `checkEffect` in the library's own tests. [`06-custom-effects.ts`](sketches/examples/06-custom-effects.ts) uses them on a bar chart and on another library's bars.

### trace

A highlighter stroke that draws itself along the walk and stays. It reads only the walk, so it works on any mark; on a point, whose walk has no length, it draws nothing.

It's a smaller version of the built-in [`trace`](api.md#trace), which adds options for the stroke's width, opacity and duration, checks them, and draws nothing at all on a walk under 0.5 px.

```ts
import { defineEffect, type Color, type EffectContext, type MarkGeometry } from "expressive-charts";

/**
 * A highlighter stroke that draws itself along the mark's walk, then stays. Its end state is the
 * finished stroke, so reduced motion shows the same thing a full run ends with.
 */
export const trace = (color: Color = "mark") =>
  defineEffect({
    async run(mark, ctx) {
      const show = stroke(mark, ctx, color);
      await ctx.tween({ duration: 500, timing: "effect", update: show }).finished;
    },
    end(mark, ctx) {
      stroke(mark, ctx, color)(1);
    }
  });

/** Draws the stroke along the walk up to progress p, and keeps it on the mark when the mark moves. */
function stroke(mark: MarkGeometry, ctx: EffectContext, color: Color): (p: number) => void {
  let current = mark;
  let progress = 0;
  const path = ctx.layer.path(mark.slice(0, 0), { stroke: color, width: 3, opacity: 0.5, linecap: "round" });
  const draw = () => path.update(current.slice(0, progress));
  ctx.onChange((next) => {
    current = next;
    draw();
  });
  return (p) => {
    progress = p;
    draw();
  };
}
```

- `run()` and `end()` both draw through `stroke()`, so the run's last frame, `mark.slice(0, 1)` with the same paint, is exactly what `end()` draws.
- With motion off the tween ends at once, so `run()` draws the finished stroke too.
- `stroke()` redraws from `onChange`, so the stroke stays on the mark when it moves, whether a run or `end()` drew it.

### delta

A data effect: "+2" just beyond the end of a mark whose value changed, in the `update` slot. It compares the last sample with the one before the update.

It's a smaller version of the built-in [`delta`](api.md#delta), which puts its text past the mark's own labels and other marks' near it (`labelBounds` and `nearbyLabels`, or outside a slice's label) and other effects' text (`ctx.texts`), words the change in the page's locale so 0.1 + 0.2 reads "+0.3", takes a `value` and a `color`, and counts float noise as no change. The built-in [`label`](api.md#label) places and rises the same way, with text worked out from the mark's data.

```ts
import { defineDataEffect, offset, type EffectContext, type MarkData, type MarkGeometry, type TextStyle } from "expressive-charts";

const finalValue = (data: MarkData | undefined): number => {
  const samples = data?.samples ?? [];
  return samples[samples.length - 1]?.value ?? 0;
};

/**
 * "+2" just beyond the end of a mark whose value changed. It rises into place and stays until the
 * next update clears it. It doesn't fade away: reduced motion shows only the end state, which would
 * then never show the change at all.
 */
export const delta = (format = (n: number) => (n > 0 ? `+${n}` : `${n}`)) =>
  defineDataEffect({
    async run(mark, data, ctx) {
      const change = finalValue(data) - finalValue(data.previous);
      if (change === 0) return;
      const show = label(mark, ctx, format(change));
      await ctx.tween({ duration: 400, timing: "effect", update: show }).finished;
    },
    end(mark, data, ctx) {
      const change = finalValue(data) - finalValue(data.previous);
      if (change !== 0) label(mark, ctx, format(change))(1);
    }
  });

/**
 * Draws the label at progress p, rising into place and fading in, and keeps it beside the mark's end
 * when the mark moves. The run and end() both draw through it, so they leave the same fields.
 */
function label(mark: MarkGeometry, ctx: EffectContext, content: string): (p: number) => void {
  let current = mark;
  let progress = 0;
  const text = ctx.layer.text(content, { ...place(mark, 0), opacity: 0 });
  const draw = () => text.update({ ...place(current, progress), opacity: progress });
  ctx.onChange((next) => {
    current = next;
    draw();
  });
  return (p) => {
    progress = p;
    draw();
  };
}

/**
 * 10 px past the end of the walk, the text reading away from the mark whichever way it grows. It
 * starts 8 px towards the mark's down side and rises to its place as `rise` goes from 0 to 1.
 */
function place(mark: MarkGeometry, rise: number): Pick<TextStyle, "at" | "anchor"> {
  const heading = mark.angle(1);
  const at = offset(mark.end, heading, 10);
  return { at: offset(at, heading - Math.PI / 2, -8 * (1 - rise)), anchor: Math.abs(heading) > Math.PI / 2 ? "end" : "start" };
}
```

- It reads its own data and nothing about the chart, so it's `defineDataEffect` with no row type: it fits any chart.
- It rises 8 px towards its place, along the mark's up side, and fades in; then it stays, since a change label is information.
- `run()` and `end()` both draw through `label()`, so `end()` leaves the same fields as the run's last frame, `opacity: 1` included. A first version drew `end()` on its own without `opacity`, and `checkEffect` reported the difference (the failure above).
- `label()` follows `onChange`, so the label stays beside the end of a bar that's still growing in the `update` slot, or that's resized.
- The anchor follows the walk's heading, so on a bar growing left the text reads away from the bar instead of over its tip.

## Review checklist

Before you publish an effect, or review one:

- [ ] It reads only `MarkGeometry` (and `MarkData` for a data effect). No chart-type checks, no DOM, no importing icons: icons come by name through `ctx.icons` or as an option.
- [ ] It draws only through `ctx.layer` and `ctx.mark`, and along a walk with `slice()`, so nothing it draws is inside a line's gaps.
- [ ] Every duration is a base value through `ctx.tween`, with `"effect"` timing (or `"stagger"` for a wait). No timers, frames or clocks of its own.
- [ ] `end()` draws exactly what a full run ends with, and anything that informs the viewer is still there.
- [ ] Data stays readable: decorations in the overlay, changes to the mark small and bounded, nothing hidden or resized while it's read.
- [ ] It's stateless: nothing shared between runs, options checked when it's made.
- [ ] It stops on abort and resolves; it follows `onChange`, after a run and after `end()`, if it should stay attached while the mark moves.
- [ ] It ends well within 5 s and never loops.
- [ ] Text is in theme text colours.
- [ ] A data effect has the row type it reads and lists its related series in `needs`.
- [ ] `checkEffect` passes on the fixtures and on real marks from the charts it's meant for.
- [ ] A transition effect honours `ctx.start`, pairs by geometry rather than by which mark is `from`, and passes `checkTransition`.
