# Writing effects

An effect is a small piece of motion that runs on one mark: a ball rolling out a bar, a halo that blinks, a label that rises into place. The library's own effects (`travel`, `flash`, `wiggle`, `pulse`) are written against the same API this guide describes, and so can yours. An effect written this way runs on every chart: our bar chart, the donut, and SVG charts drawn by D3 or Observable Plot through `expressive()`.

This guide covers the contract an effect reads, the drawing API it writes through, how it keeps time, the rules that keep charts readable, data effects, composing, and testing with `checkEffect`. It ends with two worked examples and a review checklist.

**Stability.** The author API is public, under the 0.x promise in [CHANGELOG.md](../CHANGELOG.md): from 0.1.0, a breaking change to it comes only in a minor release (0.1 → 0.2), with a migration note, and a deprecated name keeps working for one minor release. The API is `defineEffect`, `defineDataEffect`, `matrix`, `offset`, `describe.*`, the effect, context and drawing contracts described here, and `expressive-charts/testing`.

## A first effect

```ts
import { barChart, defineEffect } from "expressive-charts";

const underline = defineEffect({
  async run(mark, ctx) {
    const line = ctx.layer.path(mark.slice(0, 0), { stroke: "text-muted", width: 2 });
    await ctx.tween({ duration: 300, timing: "effect", update: (p) => line.update(mark.slice(0, p)) }).finished;
  },
  end(mark, ctx) {
    ctx.layer.path(mark.slice(0, 1), { stroke: "text-muted", width: 2 });
  }
});

barChart("#sales", { label: "Revenue by region", data, y: "region", x: "revenue", on: { hover: underline } });
```

- `run(mark, ctx)` animates. It resolves when it's done or cancelled.
- `end(mark, ctx)` draws, at once, what a full run ends with. Reduced motion shows only this.
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
| `slice(t0, t1)` | SVG path data for that part of the walk |

**The body**:

| Field | What it is |
| --- | --- |
| `thickness` | px across the walk: a bar's height, a ring's width, a stroke's width, a marker's diameter |
| `outline` | the shape's path data (`d`), whether it's an area (`closed`), and `sample(n)` |
| `bounds`, `center` | the bounding box and the visual centre |
| `pivot` | where the mark is attached to the chart: a bar's baseline, a donut's centre, a line's first point |
| `segments` | a stack's parts in order from the baseline, each a `MarkGeometry` with its `series`; every bar has at least one |
| `key`, `series` | the mark's stable identity, and its series if it has one |

What each kind of mark gives:

| | Bar | Donut slice | Line | Point |
| --- | --- | --- | --- | --- |
| Walk | middle of the baseline edge → middle of the tip | start angle → end angle, on the mid-radius arc | first point → last point | none: length 0, at the point |
| `pivot` | middle of the baseline edge | the donut's centre | the first point | the point |
| `segments` | at least one | none | none | none |

**Conventions** ([architecture.md](architecture.md#conventions) has them all):

- **Space.** Chart pixels, origin at the top left, y pointing down. The overlay you draw in uses the same space.
- **Angles** are screen angles: 0 along +x, positive turning clockwise, in (−π, π]. A bar growing right has angle 0, a column −π/2, a negative bar π.
- **Up side.** "Up" is the left of the direction of travel, `angle − π/2`: screen up for a bar growing right, outward for a donut slice walked clockwise. Put decorations on the up side and they sit the right way round on every mark.
- **Outline sampling.** A closed outline's `sample(n)` (n a multiple of 4) gives n/4 points per side, clockwise from the start-left corner. An open one (a line) gives n points along the stroke.
- **Missing and zero.** A series that isn't shown has no segment; a zero value has a segment of length 0. Treat both the same: a walk under 0.5 px should finish at once and draw nothing.
- **Never branch on the kind of chart.** There is no `mark.type`, on purpose. If an effect needs something the contract doesn't give, the contract is missing it: open an issue rather than guessing from the shape.

`describe.bar`, `.arc`, `.line` and `.point` build marks by hand, for tests or for `expressive({ geometry })`.

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

**The overlay** (`ctx.layer`):

- `layer.path(d, paint)` draws a path, unfilled unless `paint.fill` is given. `paint` is `{ fill, stroke, width, opacity, linecap }`. The handle's `update(d, paint?)` replaces the path and merges the paint fields given.
- `layer.text(content, { at, anchor, color, opacity })` draws text with `at` on its baseline, in the theme's text colour by default. `update(style, content?)` merges the style fields given.
- `layer.icon(icon, { size })` draws an icon, hidden until its first `place(transform)`. The icon is scaled by `size / icon.size` about its anchor before `place()`, so build the transform as if the icon were its natural size.
- Every handle has `remove()`.

**The mark** (`ctx.mark`):

- `mark.set({ transform, opacity, emphasis, halo })` changes only the fields given, so effects running in parallel don't undo each other. A field given as `undefined` goes back to the mark's own.
- `transform` and `opacity` apply to the mark's body; its labels and pointer target stay put. `emphasis` (0–1) mixes toward the series' strong colour. `halo: { width, opacity, color? }` strokes the outline behind the mark, half of `width` showing outside.

**Colours** are theme tokens or any CSS colour: `"text"`, `"text-muted"`, `"surface"`, `"negative"`, `"series-3"`, `"series-3-strong"`, and `"mark"` / `"mark-strong"` for this mark's own colours. Text uses text colours, never series colours.

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
- **Hover feedback is quick** (about 100 ms) and nothing should move under the cursor in a way that hides data. The chart dims the other marks itself.
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
- **Geometry moves.** A run in the `update` slot plays while the chart transitions, and a resize can come at any time. To stay attached, redraw from `onChange(mark => …)`, as `travel` and `wiggle` do.

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
| `datum` | the row behind the mark (a line gets all its rows) |
| `samples` | values along the walk, `{ t, value, at? }`, t ascending: on `barChart`, from 0 at the baseline to the total at the tip; on the donut, from 0 to the slice's share. `expressive()` gives none yet (planned for M4) |
| `related(series)` | another series of the same mark or chart, as `MarkData`, if there is one |
| `previous` | the values before this update, in the `update` slot |

- **Row types are checked.** An effect for `Region` rows is a type error on a chart of other rows, and combining it with a generic effect doesn't hide that. An effect that reads no row fields is `defineDataEffect({ … })`, with `D` left as `unknown`, and fits any chart.
- **`needs: { related: ["xg"] }`** lists the series the effect reads through `related()`. A chart without them throws when it's created, instead of the effect silently drawing nothing.
- Keep the distinction: an effect that only needs geometry should be a geometry effect, so it runs everywhere, including on host marks with no data.

## Composing

Small effects put together beat one large, configurable effect:

```ts
import { only, parallel, sequence, stagger } from "expressive-charts";

sequence(travel(soccerBall, { along: "goals" }), travel(cleat, { along: "assists" })); // one after the other
parallel(flash(), underline);         // together; done when both are
only("revenue", underline);           // on marks whose key or series is "revenue" (or a predicate)
stagger(pulse({ times: 1 }));         // each mark of a batch a little after the one before
```

- Parts share the run's context: one overlay group, one mark handle (whose `set()` merges fields) and one signal. A part with nothing to do should finish at once, so one `sequence` tells the whole story whatever the chart shows.
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
4. with motion off, no frames run and the run draws what `end()` draws.

A failure reads like this:

```
checkEffect found 16 problems with delta:
- on the bar, a full run should end with the same picture and mark style as end(): item 1 drawn after the run is {"kind":"text","content":"+1","style":{"at":{"x":210,"y":10},"anchor":"start","opacity":1}} but end() draws {"kind":"text","content":"+1","style":{"at":{"x":210,"y":10},"anchor":"start"}}
- on the bar, with motion off, no frames should run and the end state should be drawn: item 1 drawn after the run with motion off is …
- on the negative bar, …
```

Options:

| Option | What it does | Default |
| --- | --- | --- |
| `marks` | the marks to check on: named (`{ bar, slice }`), or a list such as `chart.marks()`, named by key | `fixtures` |
| `icons` | icons the effect looks up by name through `ctx.icons` | none |
| `data` | `(mark) => MarkData`, for data effects | no datum, values from 0 to 1, no related series |
| `batch` | `{ index, count }`, for effects that read `ctx.batch` | the only mark |
| `name` | what the report calls the effect | "the effect" |

- `fixtures` are one of each kind of mark: `bar`, `negative bar`, `column`, `stacked`, `short bar`, `slice`, `line` and `point`.
- A data effect typed for its own rows needs `data` that gives them (a type error otherwise), and so does one that `needs` related series (checkEffect throws otherwise).
- On real marks: `checkEffect(effect, { marks: chart.marks() })`, in a DOM environment such as jsdom.

For your own tests, `testContext({ mode, scaling, icons, batch, previous })` is a complete context on a manual clock, with `abort()`, `clear()` (the runner's cleanup) and `change(mark)` (calls `onChange`). Its `layer` and `mark` record what's drawn: `layer.picture()` gives it as plain data, rounded, and `mark.style` the mark's style. `play(ctx.clock, running)` advances the clock a frame at a time until the run settles:

```ts
import { fixtures, play, testContext } from "expressive-charts/testing";

const ctx = testContext();
await play(ctx.clock, trace().run(fixtures.bar, ctx));
expect(ctx.layer.picture()).toEqual([{ kind: "path", d: fixtures.bar.slice(0, 1), paint: { stroke: "mark", width: 3, opacity: 0.5, linecap: "round" } }]);
```

## Worked examples

Both are in [docs/sketches/examples/effects](sketches/examples/effects/), where `npm run typecheck` checks them against the real API, and both pass `checkEffect` in the library's own tests. [Sketch 06](sketches/examples/06-custom-effects.ts) uses them on a bar chart and on another library's bars.

### trace

A highlighter stroke that draws itself along the walk and stays. It reads only the walk, so it works on any mark; on a point, whose walk has no length, it draws nothing.

```ts
import { defineEffect, type Color } from "expressive-charts";

/**
 * A highlighter stroke that draws itself along the mark's walk, then stays. Its end state is the
 * finished stroke, so reduced motion shows the same thing a full run ends with.
 */
export const trace = (color: Color = "mark") =>
  defineEffect({
    async run(mark, ctx) {
      const stroke = ctx.layer.path(mark.slice(0, 0), { stroke: color, width: 3, opacity: 0.5, linecap: "round" });
      await ctx.tween({ duration: 500, timing: "effect", update: (p) => stroke.update(mark.slice(0, p)) }).finished;
    },
    end(mark, ctx) {
      ctx.layer.path(mark.slice(0, 1), { stroke: color, width: 3, opacity: 0.5, linecap: "round" });
    }
  });
```

- Its last frame, `mark.slice(0, 1)` with the same paint, is exactly what `end()` draws.
- With motion off the tween ends at once, so `run()` draws the finished stroke too.

### delta

A data effect: "+2" just beyond the end of a mark whose value changed, in the `update` slot. It compares the last sample with the one before the update.

```ts
import { defineDataEffect, offset, type MarkData, type MarkGeometry, type TextStyle } from "expressive-charts";

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
      const { at, anchor } = place(mark);
      const up = mark.angle(1) - Math.PI / 2;
      const label = ctx.layer.text(format(change), { at: offset(at, up, -8), anchor, opacity: 0 });
      await ctx.tween({
        duration: 400,
        timing: "effect",
        update: (p) => label.update({ opacity: p, at: offset(at, up, -8 * (1 - p)) })
      }).finished;
    },
    end(mark, data, ctx) {
      const change = finalValue(data) - finalValue(data.previous);
      // The same fields the run's last frame leaves, opacity included, so the two compare equal.
      if (change !== 0) ctx.layer.text(format(change), { ...place(mark), opacity: 1 });
    }
  });

/** 10 px past the end of the walk, the text reading away from the mark whichever way it grows. */
function place(mark: MarkGeometry): Pick<TextStyle, "at" | "anchor"> {
  const heading = mark.angle(1);
  return { at: offset(mark.end, heading, 10), anchor: Math.abs(heading) > Math.PI / 2 ? "end" : "start" };
}
```

- It reads its own data and nothing about the chart, so it's `defineDataEffect` with no row type: it fits any chart.
- It rises 8 px towards its place, along the mark's up side, and fades in; then it stays, since a change label is information.
- `end()` gives the same fields, `opacity: 1` included, as the run's last frame. Without it, `checkEffect` reports the difference (the sketch's first version had exactly that bug).
- The anchor follows the walk's heading, so on a bar growing left the text reads away from the bar instead of over its tip.

## Review checklist

Before you publish an effect, or review one:

- [ ] It reads only `MarkGeometry` (and `MarkData` for a data effect). No chart-type checks, no DOM, no importing icons: icons come by name through `ctx.icons` or as an option.
- [ ] It draws only through `ctx.layer` and `ctx.mark`.
- [ ] Every duration is a base value through `ctx.tween`, with `"effect"` timing (or `"stagger"` for a wait). No timers, frames or clocks of its own.
- [ ] `end()` draws exactly what a full run ends with, and anything that informs the viewer is still there.
- [ ] Data stays readable: decorations in the overlay, changes to the mark small and bounded, nothing hidden or resized while it's read.
- [ ] It's stateless: nothing shared between runs, options checked when it's made.
- [ ] It stops on abort and resolves; it follows `onChange` if it should stay attached while the mark moves.
- [ ] It ends well within 5 s and never loops.
- [ ] Text is in theme text colours.
- [ ] A data effect has the row type it reads and lists its related series in `needs`.
- [ ] `checkEffect` passes on the fixtures and on real marks from the charts it's meant for.
