# Adapter spike: can `expressive()` read D3, Plot and Vega charts?

A research spike from October 2026, done before M1 step 10 (the rect adapter). It tests the assumption behind `expressive()` ([sketches/api.ts](../sketches/api.ts), "Adapters"; [plan.md](../plan.md) §11 items 7–11): that an adapter can recover rows, keys and geometry from the SVG another library renders.

## Short answer

- **D3: yes, as designed.** `__data__` holds the row (or a d3 shape object that wraps it), rects have plain attributes, and the defaults in `api.ts` fit.
- **Observable Plot: yes for bars and lines, with one accessor.** Plot binds `__data__` too, but it holds the row's **index** into the mark's data, not the row: `datum: (el) => rows[el.__data__]`. Plot has no pie or arc mark, so there's no Plot donut to support.
- **Vega and Vega-Lite: yes with the SVG renderer, and a helper is worth it.** vega-embed 7 renders SVG by default, but a bare `vega.View` and any page that picks `renderer: "canvas"` leave no mark elements to attach to. With SVG, `__data__` is a Vega scenegraph item (the row is `item.datum`), bars are `<path>` elements, not `<rect>`, and Vega removes anything we insert into its groups when it redraws.
- **Two changes apply to every library.** Draw the overlay as a child of the root `<svg>` rather than inside the marks' common ancestor. Listen for events on the root rather than on each mark, because Plot and Vega replace mark elements.

**Recommendation:** a DOM adapter plus small library-specific helpers. Today only Vega needs a helper (`fromVegaView(view)`). Plot needs only a documented `datum` accessor.

## What was tested

| | |
| --- | --- |
| Libraries | D3 7.9.0, Observable Plot 0.6.17, Vega 6.4.0 with Vega-Lite 6.5.0 (compiled with `vegaLite.compile`, rendered by `new vega.View(…, { renderer: "svg" })`). vega-embed 7.3.0 was only read, for its default renderer. |
| Charts | A horizontal stacked bar (5 players × goals and assists), a donut (4 shot outcomes) and a two-series line (goals and xG over 10 weeks) for each library. Plot has no arc mark, so it has no donut. |
| Where | A Vite page in a scratch folder outside the repo, opened in a real browser (Chromium). No project files or dependencies were changed. |
| How | For every mark: what `__data__` holds; its attributes and the transforms above it; its bounding box in the marks' nearest common ancestor's coordinates, computed with CTMs; and whether `document.elementFromPoint` at a point inside its fill (or on its stroke, for lines) returns the mark. A real pointer hover over one bar per library checked that `pointerenter` reaches the element. Then each library re-rendered (new data, changed data, a resize) to see which elements and additions survive. |

D3 charts use the usual idioms: `d3.stack()` with one `<g>` per series, `d3.pie()` with `d3.arc()` inside a centred `<g>`, and the line idiom from [sketches/examples/05](../sketches/examples/05-d3-donut-and-line.ts) (one path per series, each path's datum is the whole season, the series name in `data-series`). Plot and Vega-Lite use long-form rows (`{ name, metric, value }`) with the series as a colour encoding.

## D3 7.9.0

| Question | Stacked bar | Donut | Line |
| --- | --- | --- | --- |
| Does the element carry its row? | Yes. `__data__` is a stack point `[y0, y1]` whose `.data` is the page's own row object. The parent `<g>`'s `__data__` is the series, with `.key`. | Yes. `__data__` is the pie arc `{ data, index, value, startAngle, endAngle, padAngle }`; `.data` is the row. | Whatever the page joined. Here both paths share the season array, so the row doesn't say which series a path is. |
| Stable key from | `d.data.name` | `d.data.outcome` | The page's own convention (`data-series` attribute) |
| Geometry from attributes | `<rect>` x, y, width and height. One transform above it: the margin `translate(60,10)` on the common ancestor. The attributes equal the CTM-based box. | Path `d` from `d3.arc()`. The angles are in the datum (d3 convention, start < end). The radii are **not**; they live in the arc generator, so the page supplies them (as in sketch 05) or they're parsed from the path's `A` commands. The centred `<g>` puts the centre at (0, 0). | Path `d` (`M…L…`), one vertex per row for linear curves. Margin transform on the common ancestor. |
| Group stacked segments | Yes. Both segments of a player share the same `d.data` object, and the series key is on the parent `<g>`: `segment: (_d, el) => el.parentNode.__data__.key`. The page doesn't need to copy the key onto each point, as sketch 04 assumes. | n/a | n/a |
| Pointer events reach marks | Yes (10/10 hit, real hover received) | Yes (4/4) | Yes (2/2, on the stroke) |
| Library API needed | None. A selection's `nodes()` and `data()` are enough. | None | None |

## Observable Plot 0.6.17

| Question | Stacked bar (`barX` + `stackX`) | Donut | Line (`lineY`, `stroke: "series"`) |
| --- | --- | --- | --- |
| Does the element carry its row? | **Only an index.** `__data__` is a number: the row's index into the mark's data (it matched Plot's render index for all 10 rects). `rows[el.__data__]` gives the row. **Caveat:** after a transform that derives new data (`groupY`, `binX`, other reducers), the index points into the derived data, so `rows[i]` is silently the wrong row. In the spike, rect 1 was Silva/goals but `rows[1]` is Okafor/assists. | Plot has no arc or pie mark. | **An index array.** `__data__` is that series' row indices. A missing value appears as `-1`, and the path starts a new `M` subpath there. |
| Stable key from | Fields of `rows[el.__data__]` (`name`, `metric`). A DOM-only route exists: an `ariaLabel` channel writes a per-element `aria-label`. But that is the screen-reader label, so it shouldn't double as a key. | n/a | `rows[indices[0]].series` |
| Geometry from attributes | `<rect>` x, y, width and height, in the SVG's own coordinates. The mark's `<g aria-label="bar">` has no transform here (facets weren't tested). | n/a | Path `d` (`M…L…`). The mark's `<g aria-label="line">` has `transform="translate(0.5,0.5)"` (Plot's crisp-edge offset). |
| Group stacked segments | Yes, by `rows[i].name`. All segments sit in one `<g>`, with no per-series group; the series comes from the row (the `fill` attribute is only a colour). | n/a | n/a |
| Pointer events reach marks | Yes (10/10, real hover received). `tip: true` doesn't change the bars; only the tip mark itself gets `pointer-events: none`. | n/a | Yes (2/2) |
| Library API | The mark's `render(index, scales, values, dimensions, context, next)` option gives the index, scaled values (`x1`, `x2`, `y`, `fill`) and unscaled `values.channels`. Those still hold after a group transform. `svg.scale("x").apply(v)` and `.invert()` give the scales in SVG coordinates. There's no live object after rendering; Plot re-renders by returning a new SVG. | n/a | Same `render` option; Plot groups the index by `z` in order of first appearance. |

## Vega 6.4.0 / Vega-Lite 6.5.0 (SVG renderer)

| Question | Stacked bar | Donut (`arc`, `innerRadius: 50`) | Line (`color: "series"`) |
| --- | --- | --- | --- |
| Does the element carry its row? | **A scenegraph item.** Vega's SVG renderer sets `__data__` to the item: `{ datum, mark, bounds, x, y, width, height, … }`. The row is `item.datum`, a Vega tuple derived from the page's row: `{ name, metric, value, value_start, value_end }`, or `{ name, metric, sum_value, … }` when aggregated. It's never the page's object, so identity can't be a key. (Vega does add an id symbol to the page's own row objects.) | Item with `startAngle`, `endAngle`, `innerRadius`, `outerRadius`, `x`, `y`; `datum` has `shots`, `shots_start`, `shots_end`. | One `<path>` per series. Its `__data__` is the **first** item; `item.mark.items` holds every point, each with `x`, `y` and `datum`. |
| Stable key from | `item.datum.name` (+ `metric`) | `item.datum.outcome` | `item.datum.series` |
| Geometry from attributes | **Not a rect.** Each bar is `<path d="M0,122h204v36h-204Z">`, so "rect → bar" by tag doesn't apply. `item.x/y/width/height` match the path. Above it: `translate(65,5)` on the group around the root frame (padding plus axis width), and `translate(0,0)` groups. That offset **moves with the data**: longer axis labels moved it to 117 px. | Path per slice with its own `transform="translate(170,100)"` (the centre). Angles use the d3 convention, but Vega-Lite gives **start > end** (Goal: 2.294 → 0.898), so they need normalising before `describe.arc` (an anticlockwise walk has its up side inward). | Path `d` (`M…L…`) in a per-series group. The items give every vertex with its row, so samples come for free. |
| Group stacked segments | Yes, by `datum.name`. All segments sit in one `<g class="mark-rect role-mark">`. Stack order differs from D3 and Plot: Vega-Lite stacks alphabetically by the colour field unless a domain or `order` is given (assists came first). Segments must be matched by series name, never by position. | n/a | n/a |
| Pointer events reach marks | Yes (10/10, real hover received). `view.addEventListener("pointerover", (event, item) => …)` reports the same hover with the item. | Yes (4/4) | Yes (2/2) |
| Library API | `view.scenegraph()` (items per named mark; Vega-Lite names the data mark `"marks"`), `view.addEventListener`, `view.data(name)`, `view.addDataListener`, `view.addResizeListener`, `view.runAfter`. The DOM↔scenegraph links (`el.__data__` and `item._svg`) are undocumented internals. | Same | Same |

**Which renderer a page gets.** vega-embed 7.3, the usual way to put a Vega-Lite chart on a page, defaults to `renderer: "svg"` (its source says `opts.renderer ?? 'svg'`). A bare `vega.View` defaults to canvas (checked). With canvas there are no mark elements, so neither events nor focus can attach to marks. Supporting canvas would mean a scenegraph-only adapter with its own overlay, which is out of scope for 0.1.

## Updates: what survives a re-render

| | D3 | Plot | Vega (SVG) |
| --- | --- | --- | --- |
| Mark elements after an update | The page's join decides; a keyed join keeps them. | Every render returns a **new SVG**; the page swaps it in. | Same `<svg>`. Replacing the data (`view.data(name, rows)`) creates **all-new mark elements**, and attributes we added (`tabindex`) are gone. Modifying tuples in place (`changeset().modify`) keeps them. |
| Something we insert into the marks' group | Kept, unless the page clears the group | Gone with the SVG | **Removed** on data replacement and on resize. Vega clears foreign children of the groups it manages. |
| Something we append to the root `<svg>` | Kept | Gone with the SVG | Kept (data replacement, resize) |
| Coordinates of the marks' group | Fixed by the page | New SVG, new layout | The root offset changes when axis labels change width |

## Recommendation for `expressive()`

**Build the DOM adapter, and add helpers only where a library's DOM falls short.** A DOM-only adapter would technically reach Vega through `datum` and `geometry` callbacks. But every Vega user would then write the same scenegraph code (item fields, arc normalisation, refresh after each run), and that code depends on Vega internals. That belongs in one tested helper, not in each page.

### 1. The DOM adapter (M1 step 10), with two changes to the plan

- **Overlay at the root.** Keep expressing geometry in the marks' nearest common ancestor's coordinates, but draw the overlay as the last child of the root `<svg>`, with a `transform` equal to that ancestor's CTM relative to the SVG. Recompute it on every `refresh()`. This gives the same coordinate space, survives Vega's redraws, and never touches a group the host manages. It changes [plan.md](../plan.md) §10 ("an overlay inserted into that ancestor"), §11 item 8 ("the overlay is drawn there") and [architecture.md](../architecture.md), Adapters ("draw their overlay there").
- **Delegated events.** Listen for `pointerover`/`pointerout` and `focusin`/`focusout` once on the root `<svg>`, and map `event.target` to the current mark through a lookup that `refresh()` rebuilds. Re-apply `tabindex` and ARIA attributes on every `refresh()`, because Plot and Vega replace mark elements. For Plot, `refresh(newSvg)` retargets the adapter to the new root.
- **Defaults stay as sketched:** `datum` reads `__data__`, and a `<rect>` becomes a bar. Both are right for D3 and hand-written SVG and for Plot's rects. When `__data__` is a number and no `datum` was given, the adapter could warn that it looks like Plot and suggest the accessor below.
- **Segments by name.** Vega-Lite stacks alphabetically by default (assists before goals), while D3 and Plot followed key and data order. So the adapter can't assume a segment order: `segment` names the series, and `travel({ along: "goals" })` already finds segments that way.

### 2. Plot: a documented accessor, no helper yet

```js
expressive(svg.querySelectorAll('g[aria-label="bar"] > rect'), {
  datum: (el) => rows[el.__data__],          // Plot binds the row's index, not the row
  key: (d) => d.name,
  segment: (d) => d.metric,
  baseline: "auto"
});
```

Document the limit: with a data-deriving transform (group, bin, reduce), the index points into the derived data, so `rows[i]` is wrong. Lines need `el.__data__.filter((i) => i >= 0).map((i) => rows[i])`. If users trip on either, add a small `plotRows(rows)` accessor that handles numbers, index arrays and `-1` gaps. A helper built on Plot's `render` option could also read channels after transforms, but it needs the page to edit its marks, so wait for demand.

### 3. Vega: `fromVegaView(view, mark = "marks")` (M3, with arcs)

A helper that returns a mark source for `expressive()`:

- Checks `view.renderer() === "svg"` and throws a clear error otherwise.
- Reads the named mark's items from `view.scenegraph()`. Each item's element is the one whose `__data__` is that item. `datum` is `item.datum`.
- Builds geometry from the item by mark type:
  - `rect` → `describe.bar` from `x`, `y`, `width`, `height`;
  - `arc` → `describe.arc` with angles normalised to start < end, plus the radii and centre;
  - `line` and `area` → `describe.line` from the items' `x` and `y`, with samples straight from the items (no `samplesAlong` projection needed);
  - `symbol` → `describe.point`.
- Refreshes itself after the view re-renders, through the view's data and resize listeners. The exact hook needs checking when it's built, because Vega renders at the end of a run.
- Pins the Vega major version in its tests, since `__data__` on SVG elements is an internal.

Keys still come from the page (`key: (d) => d.name`), because tuples are copies.

### 4. Testing without new dependencies

Unit tests for step 10 can use hand-written fixtures that copy each library's DOM conventions: D3's stack points on `__data__`, Plot's numeric index, and Vega's items and path-drawn bars. Rebuilding this spike's page (not committed) against the real libraries is the check before M3. That supports open question 12: D3 (and Plot and Vega) as dev dependencies can wait until M3.

## Proposed wording

The claims hold for D3 and Plot. For Vega they need the SVG renderer and a helper, and the wording should say so. Suggested changes (not applied here):

- **README.md**, first paragraph: "…including SVG charts you've already built with D3 or Observable Plot, and Vega or Vega-Lite charts rendered as SVG (vega-embed's default)."
- **CLAUDE.md**, "What this project is": "…through small adapters, on SVG charts built with other libraries (D3 and Observable Plot directly; Vega and Vega-Lite through a small view helper, with the SVG renderer)."
- **plan.md**, Decisions, "Product" row: "…so they also work on SVG marks from D3 and Plot, and on Vega views rendered as SVG."
- **plan.md** §10, §11 item 8 and **architecture.md**, Adapters: the overlay sits on the root `<svg>` with the common ancestor's transform (see recommendation 1).

Pie examples should name D3 and Vega only; Plot has no pie.

## Not covered

Facets, Plot plots wrapped in `<figure>` (legends, titles), Vega-Lite params and selections (which add hover encodings and can change `interactive`), area and point marks, non-linear curves, vertical bars, D3 transitions caught mid-flight, Vega's canvas renderer, and jsdom (everything here ran in a real browser).
