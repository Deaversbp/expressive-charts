# Expressive ideas by chart type

A brainstorm of expressive enhancements for common business-intelligence charts, plus radar and comparison charts. These are ideas, not commitments; the roadmap is in [plan.md](../plan.md).

Every idea is meant to pass the project's Principles:

- Effects never distort data.
- An effect that tells the viewer something leaves it visible in its end state, because reduced motion shows only end states.
- Anything that auto-plays gets a Play/Pause control.

Effect names refer to the existing and planned vocabulary: `travel`, `trace`, `flash`, `pulse`, `wiggle`, `threshold`, `delta`, `morph`, `stagger`, and staged transitions. `trace` and `delta` are custom effects in [sketches/examples/06-custom-effects.ts](../sketches/examples/06-custom-effects.ts). **Linked hover** is new (see the end).

## Comparing categories

### Bar and column (stacked, clustered, 100%)
- On hover, an icon rolls along each segment (`travel` with `along`), as in the ball-and-cleat story, with any icon pack.
- A layout morph keeps each bar's identity: clustered → stacked → 100%. The segments slide from side by side into the stack and then rescale, so readers see that "100%" is the same data, normalised.
- The part of each bar past a target line changes colour (`threshold`), and the end state keeps the colour.

### Diverging bars (positive and negative around zero)
- The icon rolls away from zero in the bar's own direction. Upright icons such as the cleat mirror instead of turning upside down (`orient: "auto"`).
- Colour by sign: `threshold({ compareTo: 0 })`.

### Butterfly / tornado
- Both halves grow outward from the central axis at the same time, so a row reads as one unit.
- Hovering one half highlights its mirror on the other side (linked hover).

### Dumbbell
- A token travels from the "before" dot to the "after" dot along the connector, so the direction it moves *is* the change. It's coloured by sign.
- Sorting by gap uses the staged transition: values first, then positions.

### Slope chart
- Lines draw themselves from left to right (`trace`), and hovering one dims the others.
- A "+14%" label rises at the right end and stays (`delta`).

### Bullet chart
- The value bar fills up. If it passes the target marker, the marker flashes once (`flash`).
- The background bands never move: context should stay still.

### Combo (columns + line)
- Hovering a column also lights up the line point for the same x (linked hover), and tints the axis that belongs to the hovered series. That helps with the confusion dual-axis charts cause.
- A ball rides along the line over the columns (`travel` with `ride: "on"`).

## Trends

### Line
- The line changes colour below a reference series or a target (`threshold`), as with goals vs xG.
- A playback reveals the line with a dot riding its leading edge, with Play/Pause.
- At key events, a callout line draws itself in (`trace`), then a label fades in and stays.

### Area (stacked, 100%)
- Hovering a layer dims the others and outlines its top edge. Nothing shifts: moving one band would move every band stacked above it.
- Fill colour changes above and below a baseline (`threshold`).
- A morph switches between stacked and 100% stacked.

## Part-to-whole

### Pie / donut
- An icon rolls around the hovered slice (`travel`), and slices sweep in clockwise from 12 o'clock on entry.
- Pulling a slice out on hover is fine if it's capped at a few pixels (a small, bounded change).
- A morph to bars when precision matters (the lab's third card).

### Treemap
- Drilling down is a staged transition: the other tiles fade, then the chosen one expands. Reverse it on the way out.
- A treemap ↔ bars morph turns each tile's area into a bar's length, for "which is bigger?" questions.
- Use a stable, ordered layout. If the tiles reshuffle on every update, no animation can make that readable.

### Waterfall
- A token steps down the staircase one step at a time and ends at the final total. This is a `sequence` of `travel`s, where each step's path runs from the previous total to the new one.
- The connector lines draw in (`trace`), and each step keeps its "+12" or "−8" label (`delta`).

### Funnel
- A label like "−38%" rises into place between stages and stays (`delta`).
- Optionally, decorative "droplets" fall through the stages in proportion to the conversion rate. They stay in the overlay and run for a limited time. Under reduced motion only the drop-off labels remain.

## Relationships

### Scatter / bubble
- Hovering a point makes it pulse and outlines its nearest neighbours or its cluster.
- A connected scatter over time (Gapminder style) plays back with trails that draw themselves (`trace`). It needs Play/Pause.
- Outliers flash once when they first appear (`flash`).

### Radar / spider
- Each point's path is its spoke, so on hover a dot travels from the centre out to the value (`travel`).
- The parts of the shape that lie outside a target polygon change colour (`threshold`).
- Hovering a spoke highlights that axis across every series (linked hover).
- A radar → bars morph unrolls the spokes into bars for precise comparison.

## Single values and detail

### Card and KPI
- The number counts up from its previous value. That's the card's own update transition, like a bar resizing, not an effect.
- A "+12% vs last month" chip, coloured by whether it beats the target (`threshold`). A sparkline that draws itself in (`trace`).

### Table and matrix
- Sorting slides rows to their new places instead of redrawing the table.
- A changed cell flashes once, and its ↑ or ↓ arrow stays (ticker style).
- In-cell data bars and sparklines get the same effects as full-size charts.

## Geographic

### Map
- Hovering a region outlines it and dims the rest. Regions change colour against a target (`threshold`).
- On flow maps, tokens travel along the route arcs from origin to destination; each route is a mark whose path is the arc.
- Time playback with Play/Pause. Avoid automatic zooming or panning, which disorients readers.

## What this means for the library

- **Most of these use effects we already have:** `travel`, `trace`, `flash`, `pulse`, `threshold`, `delta`, `morph`, and staged transitions.
- **Linked hover is new, and it isn't an effect.**
  - Effects only touch their own mark; that's why hover dimming is chart behaviour.
  - Linking lights up *other* marks, so it belongs one level up. Hovering key K in one chart or series fires a hover for key K in the linked ones, and their ordinary effects then run.
  - It generalises the line chart's `pointer: "x"` across series and across charts: combo charts, butterflies, small multiples, radar axes.
- **Maybe later: a droplet "pour" effect.** It's decorative and could be expensive to render, so it would need measuring first.
- **The `MarkGeometry` contract holds up.**
  - Marks with no direction (scatter points, treemap tiles, map regions, table cells) have a path of length 0: `travel` does nothing on them, and halos still work.
  - The new kinds of path are all lines or arcs: radar spokes, dumbbell connectors, waterfall steps and map routes. The planned `describe.line` and `describe.arc` builders cover them.
- **Count-ups and layout changes aren't effects.** A counting KPI is the card's own update transition. Changes like clustered ↔ stacked, absolute ↔ 100%, and treemap ↔ bars are morphs between charts.
- **What "never distort data" rules out:**
  - bouncy or elastic easing on bars, because the overshoot briefly shows a value the data doesn't have;
  - exploded 3D pies;
  - pulsing that never stops without a pause control;
  - maps that zoom by themselves.
