/**
 * The public API of expressive-charts, as the examples in ./examples import it ("expressive-charts").
 *
 * It began as a design sketch, declarations only, in the October 2026 design session. Everything in
 * it is built now and re-exported from src, so the examples are checked against the real thing. The
 * comments below say where the built API differs from the sketch. Lines marked NEW were added because
 * writing the examples exposed a gap in the plan (docs/plan.md). The conformance suite is ./testing.ts,
 * and the sport icons are ./icons-sport.ts.
 */

export * from "../../src/index";
import type { ChartOptions as BuiltChartOptions } from "../../src/index";

// ── Shared contracts and drawing API: built, in src/core/contracts ───────────
// MarkGeometry, Outline, Sample, MarkData (with previous), Paint, MarkStyle, MarkHandle, IconHandle,
// PathHandle, TextStyle, TextHandle, Layer, EffectContext (with previous), GeometryEffect,
// DataEffect, TransitionEffect, TransitionContext (with start), MarkEffect, AnyMarkEffect, Combined; and the effect slots
// (EffectSlot, EffectSlots, EffectOption, PresetName). The runner that plays slots is internal.

// ── Effects ──────────────────────────────────────────────────────────────────

// travel (with TravelOptions), the gaits (gaits.roll, .step, .slide; Gait, GaitState, GaitPose),
// flash, wiggle, pulse and the combinators sequence, parallel, only and stagger are built, in
// src/effects. Changed from the sketch: a gait can carry its own easing and pace (a step takes 15%
// longer and eases in and out, as in the prototype), and GaitState gives distances in the icon's own
// units plus its rolling radius (instead of its size), so a gait looks the same at any size. flash
// takes a width and opacity too, pulse a width; stagger's delay is optional (default 50 ms, the
// spread capped at 500 ms), and it returns an effect of the same kind rather than the same type.
// threshold (with ThresholdOptions) is built too, as sketched (M4 decision 11). So is morph (with
// MorphOptions and MorphAlign, M5 step 1). Changed from the sketch: it takes `align`, "unroll" or
// "drop" (M5 decision 1), and a transition's run and end take a TransitionContext, an EffectContext
// with `start`, so a switch back mid-way retraces (decision 6).

// NEW: helpers for effect authors. Built in M3 (src/effects/define.ts) and public, with
// GeometryEffectSpec and DataEffectSpec<D>, as are matrix (translate, rotate, scale, multiply, apply)
// and offset (src/core/geometry). Changed from the sketch: DataEffectSpec's run, end and clear are
// function-typed properties, as on DataEffect, so a spec is checked against its row type strictly.
// The conformance suite is "expressive-charts/testing" (./testing.ts); docs/effects-guide.md is the guide.

// ── Icons: neutral core set; sports icons live in "expressive-charts/icons/sport" ─

// Icon and IconShape are built, in src/core/contracts (with linecap and linejoin on shapes, for the cleat).
// defineIcon (with IconSpec), iconFromSvg (with SvgIconSpec) and the core icons (dot, arrow,
// chevron) are built, in src/icons; registerIcon and registerIcons in src/registries.

// ── Presets ──────────────────────────────────────────────────────────────────

// PresetName and registerPreset are built (src/core/contracts, src/registries), and so are the
// built-in presets, exactly wiggle, pulse and flash. Built-in names autocomplete; custom names are
// checked when the chart is created.

// ── Events and effect slots (shared by reference charts and adapters) ───────

// EffectOption and EffectSlots are built, in src/core/contracts. NEW: slots are grouped under `on`,
// so the `update` slot no longer collides with `chart.update()`. MarkEvent and MarkEvents are built,
// in src/charts.

// The sketch's MarkSourceHandle, what reference charts and adapters have in common, went with its
// chartSwitch declaration: the built chartSwitch types its views by what it uses (ChartSwitchView:
// element, marks(), labels(), focus(key) and destroy()), so adapters can join later (M5 decision 4).

// ── Geometry builders: public, shared by reference charts and adapters ───────

// describe.bar, .arc, .line, .point and .shape are built, in src/core/geometry (with the Baseline type and
// NEW: an optional `gap` between bar segments). Changed from the sketch: describe.shape, which would
// walk an SVG element with getPointAtLength, reads path data instead, describe.shape({ key, d, matrix,
// width }) with ShapeSpec (M9 decision 4, built in M9 step 3): the library follows the path itself, so
// it works in Node and jsdom, and the same in every browser.

// NEW: every builder's spec takes labelBounds (M7 decision 4) and nearbyLabels (M10 decision 11), the
// boxes of the mark's own labels and of other marks' labels near it, passed through to MarkGeometry.
// delta and label pick their way from the first and go past both, so their text keeps clear of the
// mark's own labels and its neighbours'.

// NEW: samplesAlong(mark, points) projects data points (in mark coordinates) onto a mark's walk,
// giving data effects their samples. Built in M4 step 4 (src/core/geometry), with the SamplePoint type
// for its points. Points at the same t keep their order.

// ── Adapters: effects on charts built with other libraries ───────────────────

// expressive() with MarkSource, Attachment (with refresh() and focus()) and ExpressiveOptions is built,
// in src/charts/adapter (M1 step 10, for rects). Changed from the sketch: `key` may return a number
// (converted with String()), `datum` defaults to a selection's data() before element.__data__,
// `geometry` is called once per mark with its first element, and `baseline: "auto"` also finds
// negative bars (a mark whose far edge is on the shared line grows the other way). The `samples`
// option is built too (M4 step 4): it's also called for each named segment, its samples are checked
// when read, and rects with a numeric `value` get the bar chart's samples without it. So is `watch`
// (M4 step 6): it re-reads only the marks whose geometry attributes changed, or that sit in an
// ancestor that moved, once a frame, and fires no events, so refresh() still says what the data did.
// fromVegaView() is built too (M4 step 8), with VegaOptions, VegaViewLike and VegaAttachment. Changed
// from the plan's fromVegaView(view, mark = "marks"): it takes expressive()'s options with `mark` among
// them, plus `sample` for data effects' values, and returns the attachment, which follows the View's
// renders itself. M9 step 1 gave both attachments update({ on }) and leave(), as the charts have, and
// fromVegaView() reads a line Vega breaks at a missing value, with its gaps. M9 step 6 made expressive()
// read <circle>s as points and <path>, <line>, <polyline>, <polygon> and <ellipse> as shapes, with
// describe.shape, so `geometry` is only for other elements, or to say more than an element shows.
// M10 step 4 made fromVegaView() read a line Vega draws as a curve, from its path, with describe.shape.

// ── Reference charts ─────────────────────────────────────────────────────────

// KeyOfType, Accessor, NumericKey, ColorAssignment and colorAssignment are built, in src/charts. So are
// the three reference charts, barChart (M1 step 5), donutChart (M3 step 4) and lineChart (M4 step 5),
// with their options (tooltips and the data table too, since M2) and their handles, which have
// focus(key) and labels() since M5 step 2, so they're no longer declared here. Changed from the sketch:
// the donut's `category` names each slice (the sketch's `key` is the optional key, as on bars); the
// line chart's x is number | Date, as sketched (Dates since M6 step 1, with `timeZone` and `xFormat`,
// and reveal() takes a Date too), it has no `pointer` option, since the crosshair is its hover (M4
// decision 9), and `labels` words its end labels. NEW in M5: barChart's `colorBy: "category"` colours
// each bar by its key, so a ColorAssignment shared with a donut keeps each category's colour (M5
// decision 8).

/** NEW NoInfer on `on` (built): without it, a data effect such as threshold() (D = unknown) widens D and switches off field checking. */
export interface ChartOptions<D> extends BuiltChartOptions<D> {}

// chartSwitch is built (M5 step 3, src/charts/switch.ts), with ChartSwitch, ChartSwitchOptions,
// ChartSwitchView, ChartSwitchViewFactory, ChartSwitchViewName and ChartSwitchViews. Changed from the
// sketch: each view's function is given the switch's ColorAssignment beside its container, so a
// switch that makes its own still shares it with every view; `transition` defaults to morph();
// `announce` says the new view's label; the handle has chart(view), typed as that view's function
// returns it; and ChartSwitch is typed by the views record rather than by their names. Since M9 step
// 2 the handle also has on(), marks() and leave(), the view on show's, so link() takes a switch.

// ── Playback and on-page controls ────────────────────────────────────────────

// playback (src/core) and playButton (src/charts/controls) are built. Changed from the sketch: playback
// also takes a clock, as animated values do; seek takes { animate }; and it has subscribe() and
// destroy(). playButton takes { labels } and returns a PlayButton ({ element, destroy() }), and it has no
// aria-pressed, since its name changes between Play and Pause.

// motionSwitch, the Presentation / Analysis / Off control, is built (src/charts/controls). Changed
// from the sketch: it takes options ({ persist }) and returns a MotionSwitch.
