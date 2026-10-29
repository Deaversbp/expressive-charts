# Accessibility audit: WCAG 2.2 AA

This is a written WCAG 2.2 AA pass of the demo pages, made before the first release. It covers `bars.html`, `donut.html`, `line.html` and `morph.html`, since M7 `season.html`, and since M9 `shapes.html`: the library's charts, its controls, and the D3, Observable Plot, Vega-Lite and hand-written charts that `expressive()` and `fromVegaView()` drive there. `stress.html` has no table yet. axe and the DOM checks below run on it as on the others, but its criteria haven't been written up. `index.html` (a list of links) and `lab.html` (the single-file prototype the library grew out of, which doesn't use it) aren't part of it.

It was done on 23 October 2026, on commit `26e8fa5` with the fixes below. Since then the last card of each page has been rewritten, which took away the bars page's one link; that page's rows for 2.4.3 and 2.4.4 describe it as it is now. And in M7 (24 October 2026), hover stopped dimming the other marks' labels, with a check that they keep 4.5:1 (**contrast on hover**, below); the rows for 1.4.3 and the judgement call on dimming describe it as it is now. `season.html` came in M7 step 5, and its table was written then (26 October 2026), from the same checks. In M8 the tooltip became hoverable, which fixed finding 6, with a check that a pointer can move onto it (**onto the tooltip**, below); the rows for 1.4.13 describe it as it is now. Later in M8 (27 October 2026) the line page gained two charts with missing weeks, whose rows are under [line.html](#with-missing-weeks-m8), and the season page dropped its workarounds for what the library now does, which changed its row for 1.4.10. Then keyboard focus at a week with no values got a line in the focus colour, which made the third judgement call a pass. In M9 (27 October 2026) the shapes page came, with [its table](#shapeshtml), written from the same checks; the donut page's D3 pie began to swap its effects in place, and the morph page's switch was linked with a bar chart beside it, which add to those pages' rows. In M10 (28 October 2026) the line page gained two toggles, Straight or Curved and Each week or Nearest point, whose rows are under [line.html](#the-toggles-and-a-hover-on-one-point-m10), with a problem the library then fixed (finding 7), and the season page's goals line gained `delta()`, which adds to its rows. Each criterion has a result: **pass**, **fail**, or **not applicable**, with its evidence. The screen-reader runs are in [a11y-check.md](a11y-check.md#results).

## How it was checked

- **axe.** `axe-core` 4.14.0, a dev dependency pinned exactly, runs its WCAG rules for levels A and AA in 2.0, 2.1 and 2.2 (the tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` and `wcag22aa`: 70 of its 105 rules). It runs on every page at rest in light and in dark, under forced colours in each, at 320 px wide, on `morph.html` part way through a switch, and since M10 on `line.html` with Curved and Nearest point picked and a point focused, in light and dark. That's `tests/visual/a11y.spec.ts`, in Chromium, Firefox and WebKit.
- **DOM checks** in the same file, for what axe can't see. Below, each has a short name:
  - **tab order**: every tab stop in order, each showing its focus (the chart's ring, or the control's outline), then Shift+Tab back through every one;
  - **ring**: the tooltip never covers the focus ring, at any mark of each library chart;
  - **hover**: the tooltip stays while the pointer does, Escape hides it without the pointer moving, and it stays hidden until the pointer moves off and onto a mark;
  - **onto the tooltip**: on each library chart, the pointer moves from a mark onto its tooltip 2 px at a time, across it, then off it onto another mark or away. The hover and the tooltip's text stay until it leaves, the other mark is hovered, and away nothing is. And Escape with the pointer on the tooltip hides it until the pointer moves, though the browser hit-tests the mark it uncovers. The bridge over the gap takes the pointer inside its trapezoid and nowhere else. And on `line.html`, a tooltip that comes up under the pointer lets it through, so the crosshair follows the pointer across it, until the pointer has been off it (added in M8);
  - **contrast on hover**: while a mark of each library chart is hovered, in light and dark, every text in the chart keeps 4.5:1 against the card behind it, at the opacity it's drawn with (added in M7);
  - **spacing**: with WCAG 1.4.12's spacing added after load, no chart's text overlaps other text or leaves its card;
  - **5 s**: nothing on the page moves by itself 5 s after load;
  - **reflow**: at 320 px the page doesn't scroll sideways;
  - **forced**: under forced colours, each legend's swatches keep their own colours, and a pressed toggle shows in the viewer's selection colours.
- **The rest of the visual suite**: reduced motion and Off on each page, Play and Pause, the scrubber, the switch's timing, and what a screen reader can reach mid-switch (Chrome's accessibility tree, read over CDP).
- **Contrast of SVG text and marks**, which axe reports as "incomplete" rather than judging: worked out from the theme's tokens ([Contrast](#contrast)), and validated for the marks by `src/charts/render/theme.test.ts`.
- **NVDA + Chrome**, by the project's maintainer, from [a11y-check.md](a11y-check.md): sections A, D, E (steps 1–12) and F, before the fixes. Section C, section E's steps 13 and 14 (after fix 2), and section G, the stress page's date line, passed on 24 October 2026. Section H, the season page's linked hover and change labels, passed on 26 October 2026. Section I, M8's missing weeks, Page Up and Page Down, and the season page again, passed on 27 October 2026. Section J, M9's shapes page, the D3 pie's picker and the morph page's link, passed on 27 October 2026. Section K, M10's toggles and hover on one point on the line page, and the season page's goals line, passed on 28 October 2026. VoiceOver + Safari is recorded as not run for 0.1, and is in the backlog.
- **By hand**, in headless Chromium: the pages at 320 px, with the text spacing, and under forced colours, looked at as pictures; the tooltip's place against every focused mark; the target sizes of every control and mark; and Chrome's accessibility tree for each chart.

## What it found

Seven problems: five fixed as part of the audit, the sixth in M8, and the seventh, found and fixed in M10. Three judgement calls are listed after them. The third came from M8's charts with missing weeks, and a change later in M8 made it a pass.

**Fixed:**

1. **Light text under 4.5:1 on the demo pages (1.4.3).** axe found the pages' muted text (#7d7b75) at 3.9:1 on the page background, the motion switch's hint (`--ec-text-muted`, #75736d) at 4.37:1 there, the bars page's link (#2a78d6) at 4.3:1, and the morph page's "Morph" label. Muted text is now #6f6d67 (4.78:1 on the page, 5.04:1 on a card), the motion switch takes it as its `--ec-text-muted`, since it sits on the page rather than a chart's surface, and links are #226dc7 (5.01:1). Dark already passed. The library's own tokens pass on its own surface, so they're unchanged; architecture.md says a page should set `--ec-text-muted` darker on a darker background. *Changes the light page and motion switch screenshots; see [Screenshots](#screenshots).*
2. **Vega's unnamed image role around each line (1.1.1, 4.1.2).** On `line.html`, Vega gives the group around each line `role="graphics-symbol"` with no name, and the groups above it `graphics-object`. axe flagged the first in every condition. Taking it off alone left Chrome naming the `graphics-object`s from their contents, so NVDA would have heard both lines' names again as a group. With `markLabel`, `expressive()` takes those roles off any unnamed host element around a named mark, on every read, since Vega writes them again when it redraws. Chrome's tree for the Vega-Lite line is then the D3 line's: the group, then one image per line. This is what section E's step 13 listens for, which passed with NVDA + Chrome on 24 October 2026.
3. **The tooltip couldn't be dismissed under the pointer (1.4.13).** It covers the marks above the one it describes, and Escape ended a hover only with focus on a mark. Now Escape anywhere ends the hover, the pointer's too, as `leave()` does; an Escape the page has already handled is left alone.
4. **The line page's own legends lost their colours under forced colours.** Windows contrast themes force border colours but not SVG strokes, so the D3 and Vega-Lite cards' swatches all turned the theme's text colour while their lines kept theirs. They opt out with `forced-color-adjust: none`, as the library's legend swatches already did.
5. **Pressed toggles were told apart only by weight under forced colours.** Forced colours drop a button's background, so the motion switch's pressed mode, and the pages' own toggles, had only their bold left. They take `Highlight` and `HighlightText` there now.

**Fixed in M8** ([the development log](plan.md#m8-a-tooltip-that-can-be-hovered-change-labels-that-hold-up-and-gaps-in-lines-030)):

6. **The tooltip couldn't be hovered (1.4.13, "hoverable").** It was `pointer-events: none`, so moving the pointer onto it hovered whatever was under it: another mark, whose tooltip replaced it, or nothing, which hid it. Now it takes the pointer while it shows, and the pointer on it stays on the mark it describes: leaving it for a mark hovers that mark, and leaving it for anything else ends the hover. Beside a mark, a clear bridge spans the 12 px gap between them, so the pointer can go straight from one to the other: without it, the pointer crossed 4 or 5 px of the next row on the bars page, and 10 to 13 px of nothing round the donut. A tooltip that comes up under the pointer, as a crosshair's can, lets it through until the pointer has been off it, so it never catches a pointer running along a chart. The marks it covers are reached round it, since a bar's target is its whole row or column, or by keyboard. Escape still hides it without the pointer moving.

**Found and fixed in M10** ([the development log](plan.md#m10-curved-lines-a-hover-on-one-point-and-labels-that-keep-clear-050-)):

7. **A point's tooltip couldn't always be hovered (1.4.13, "hoverable").** With Nearest point, the pointer anywhere over the plot hovers the point nearest it, so on the way from a point up to its tooltip it had to stay nearer that point than any other until it was on the bridge or the tooltip. Measured on the line page's first chart in Docker's Chromium, moving the pointer a pixel at a time from each point straight up into its tooltip (54 of the 76 points have it above at 1,000 px; the rest have it below, near the top of the chart):
   - **The bridge started too far up.** It starts about 3 px above the point's centre. Where the other line's point at that week was less than about 6 px above, the pointer was nearer that one first, and it took the hover: 14 points at either width (at 1,000 px, the lower of the two at weeks 1, 3, 4, 8, 9, 12, 14, 16 to 21 and 23).
   - **A gap between the tooltip and its bridge.** The tooltip's box ended a fraction of a pixel above its bridge (0.36 px here). Where a whole pixel fell in that gap, as the pointer lands on one, the pointer was on neither, so it was over the plot, and the nearest point there took the hover: at 320 px, 37 more of the points lost it there, 16 or 17 px up; at 1,000 px none, by where the pixels fall. On bars, and on a line chart's weeks, the same mark is under the gap, so nothing changed there.

   Now, while the tooltip shows, the pointer on the hovered point's dot stays on that point, though another is nearer, so it reaches the bridge, which starts a pixel inside the dot. And the bridge reaches a pixel into the box, as it does into the mark. `line.spec.ts` moves the pointer a pixel at a time from every point to its tooltip, up or down, at 1,000 and 320 px, and no point loses the hover. Where the two lines' points are drawn within a pixel or so of each other (at weeks 7 and 13 they're equal), the pointer hovers the nearer, or goals, the series first, as before; the keyboard reaches both.
   
   Either way, the point that takes the hover brings up its own tooltip, and the first one's goes. Every point's tooltip shows on focus, and its value is in its name and the table. Starting the bridge at the point's centre, and drawing it flush with the tooltip's box, would fix both. A library step before 0.5.0 is to fix it.

**Judgement calls**, which could reasonably go the other way:

- **Dimmed marks while another is hovered (1.4.11).** Hover dims the other marks' bodies to 30%: their bars fall to 1.5:1. The values are all still in the tooltip, the names and the table, and leaving restores them, so this audit counts it as a pass at rest with the hover state noted, not a fail. At the audit their labels dimmed with them, to 2.0:1 in light and 2.5:1 in dark, which made 1.4.3 a judgement call too. Since M7 the labels stay at full strength, so 1.4.3 passes while a mark is hovered (contrast on hover).
- **Focus at a week with no values (1.4.11, 2.4.7), a pass since later in M8.** On the line page's chart with missing weeks, matchweeks 9 and 10 have no values, so keyboard focus there has no point to ring. At first it showed as the crosshair, a 1 px dashed line in the axis colour (1.8:1), with the tooltip at its top naming the week ("Matchweek 9, goals missing · xG missing"), and the week's name was read. This audit counted that as a pass, with the crosshair's contrast noted. But Escape hides the crosshair and the tooltip, and then nothing showed the focus. Now the chart draws a 2 px line in the focus colour where the crosshair is, at 4.3:1 against the surface in light and 4.8:1 in dark, and it stays after Escape. So it passes with nothing to note. While the tooltip shows, it covers the line's top (2.4.11, below).
- **Target sizes of marks (2.5.8).** Every control passes (axe's `target-size` rule): each is 24 px tall or more, or spaced so a 24 px circle round it touches nothing. The line chart's weeks are columns 9.4 px wide, side by side, and the D3 and Vega-Lite lines take the pointer only on their 2.25 px strokes. The weeks' spacing is the data's own, which is the criterion's "essential" exception, and hovering a line only emphasises it, with nothing to activate or read. Both are reached by keyboard, and every value is in the names and the table.

## Contrast

Text and marks inside the charts are SVG, which axe doesn't judge. Their colours are theme tokens, so the ratios are worked out once, against the surface each sits on:

| What | Light | Dark | Needs |
| --- | --- | --- | --- |
| `--ec-text` (labels, values, the tooltip) on `--ec-surface` | 19.2:1 | 15.2:1 | 4.5:1 |
| `--ec-text-muted` (ticks, table headers, the centre label) on `--ec-surface` | 4.62:1 | 5.24:1 | 4.5:1 |
| The pages' muted text on the page / on a card | 4.78:1 / 5.04:1 | 5.77:1 / 5.24:1 | 4.5:1 |
| The pages' links on a card | 5.01:1 | 4.79:1 | 4.5:1 |
| The focus ring, `--ec-focus`, on `--ec-surface` | 4.30:1 | 4.79:1 | 3:1 |
| The threshold's red, `--ec-negative`, on `--ec-surface` | 4.68:1 | 5.39:1 | 3:1 |
| The marks, `--ec-series-1` … `-8` | 3.10:1 or more | 3:1 or more | 3:1 |

The marks' figures are validated by `theme.test.ts`, which fails if any slot falls under 3:1 in either theme. The focus ring has a gap of `--ec-surface` between it and the mark, so it's measured against the surface, never against a bar in the same blue. Gridlines and the axis are 1.3:1 and 1.8:1: they're decoration, since every value is labelled, and so aren't held to 1.4.11. A line chart's crosshair is the axis colour too, and decoration: at a week with no values, where there's no point to ring, a 2 px line in the focus colour shows the focus (the third judgement call, now a pass).

## Browsers

Every DOM check in the visual suite, this audit's included, runs in Chromium, Firefox and WebKit, in the Playwright image CI uses (Playwright 1.64.1, Linux): 250 tests in each since finding 7 was fixed (28 October 2026), 29 of which Firefox and WebKit skip. Screenshots are Chromium's only. Two kinds of check run in Chromium alone, and are the 29: the switch's accessibility tree, which is read over CDP, and forced colours, since Firefox's and WebKit's emulation only matches the media query and forces no colours.

The first runs in Firefox and WebKit failed in four ways, and each was the test, not the library:

- **Boxes with strokes.** Firefox's `getBoundingClientRect()` on an SVG shape includes its stroke, and for a path a miter allowance: the line chart's focus ring measured 41 px across, where it's drawn 17 px across and Chromium reports the 9 px fill. The bar page's staged switch measured a bar with its flash's halo. The checks now measure fill boxes, plus half the stroke for the ring.
- **Whole pixels.** Firefox's pointer lands on whole pixels, so aiming at a point on the Vega-Lite line's 2.25 px stroke could land just off it. The test aims at a whole pixel on the stroke.
- **Past the last stop,** Chromium takes focus off the page, and Firefox and WebKit keep it on the last stop. The tab order check stops at a stop it has seen.
- **Line boxes.** Firefox and WebKit make an SVG text's box its line box, a little taller than its glyphs, so two stacked lines of a label touch. The text-spacing check compares the middle of each box.

So the library behaves the same in the three engines, as far as these checks go: every name, role, tab stop, focus ring, tooltip, key, switch and reduced-motion end state. README can name Chrome and Edge (Chromium), Firefox and Safari (WebKit). It's an engine's word, not a device's: Safari on macOS and iOS, and VoiceOver with it, weren't run.

## Screenshots

Only the first fix changes pictures: the light pages' muted text and the motion switch's hint, a shade darker. The change is under the suite's 0.1 per-pixel threshold, so the old baselines still passed; these 11 were made again in Docker so they match exactly: `page-light`, `donut-page-light`, `line-page-light`, `morph-page-light`, `mode-presentation-switch`, `mode-analysis-switch`, `mode-off-switch`, `reduced-switch`, `line-play-week-20`, `morph-columns-light` and `morph-focus-columns`. Every other baseline is unchanged.

Making them again also rewrote 13 others by a few levels on anti-aliased edges (the D3 pie, the hand-written chart, the Vega-Lite line), with nothing of the fixes in them. The code from before the fixes, rendered in the same image, rewrites the same 13, so they were left as they were.

## Not covered

- **VoiceOver + Safari**, on any page (in the backlog). WebKit runs the DOM checks, which isn't the same as hearing them.
- **JAWS, Narrator, TalkBack** and other screen readers, and speech input such as Dragon. Names were checked to contain each control's visible label (2.5.3), which is what speech input needs.
- **A real Windows contrast theme.** Forced colours were emulated in Chromium, the one browser whose emulation forces colours (Firefox's and WebKit's only match the media query, so the forced checks skip them). The emulation's palette is black on white, or white on black with the dark theme. A real theme has its own colours, and the charts take their light or dark tokens from `prefers-color-scheme`, as always, so their text is readable on a dark contrast theme only if the browser reports dark there. That wasn't tried on a real theme.
- **Real devices.** Touch was checked as far as the visual suite taps; nothing ran on a phone.
- **Text-only zoom.** Page zoom to 400% is the 320 px check. Firefox's "zoom text only" wasn't tried; the charts' text is sized in px, which it scales too.

## Not applicable on any page

| Criterion | Why |
| --- | --- |
| 1.2.1–1.2.5 Time-based media | No audio or video. |
| 1.3.5 Identify input purpose | No fields about the user. |
| 1.4.2 Audio control | No audio. |
| 2.2.1 Timing adjustable | No time limits. |
| 2.5.4 Motion actuation | Nothing responds to moving the device. |
| 3.1.2 Language of parts | Everything is in English, the pages' language. |
| 3.2.6 Consistent help | No help. |
| 3.3.1, 3.3.3, 3.3.4 Errors | No input can be wrong: every control is a button, a toggle or a slider. |
| 3.3.7 Redundant entry, 3.3.8 Accessible authentication | No forms, no sign-in. |
| 4.1.1 Parsing | Removed from WCAG 2.2. |

## The criteria that apply, page by page

Evidence names the checks above (**axe**, **tab order**, **ring**, **hover**, **spacing**, **5 s**, **reflow**, **forced**), a spec in `tests/visual`, a section of [a11y-check.md](a11y-check.md) heard with NVDA + Chrome, or [Contrast](#contrast).

### bars.html

The library's `barChart` with `travel`, and the hand-written chart through `expressive()`.

| Criterion | Result | Evidence |
| --- | --- | --- |
| 1.1.1 Non-text content | Pass | axe. Each chart is a named group; each bar an image named "Okafor: 16 goals"; the ball, the boot and the focus ring are in `aria-hidden` overlays. NVDA A and C. |
| 1.3.1 Info and relationships | Pass | axe. The table has a caption, column headers and the player as row header (NVDA A, steps 11–13). The toggles are groups named Metric and Sort. |
| 1.3.2 Meaningful sequence | Pass | Bars are in the DOM in the order shown, and follow a re-sort (`bars.spec.ts`, NVDA A step 9). |
| 1.3.3 Sensory characteristics | Pass | The page's instructions name controls and keys, not shapes or places. |
| 1.3.4 Orientation | Pass | Nothing locks orientation; reflow. |
| 1.4.1 Use of colour | Pass | Goals and assists in a stack differ by colour, with a legend, but each bar's name, the tooltip and the table give both values. A pressed toggle is bold too. |
| 1.4.3 Contrast (minimum) | Pass (fixed) | axe, light and dark, after fix 1; [Contrast](#contrast); contrast on hover: while a bar is hovered, the others' labels keep 4.5:1. |
| 1.4.4 Resize text | Pass | reflow covers 400%. |
| 1.4.5 Images of text | Pass | All text is text. |
| 1.4.10 Reflow | Pass | reflow and axe at 320 px. The library's chart lays out again at the width; the hand-written one scales. |
| 1.4.11 Non-text contrast | Pass | [Contrast](#contrast): marks, ring. Dimmed bars while hovering: judgement call. |
| 1.4.12 Text spacing | Pass | spacing. |
| 1.4.13 Content on hover or focus | Pass (fixed) | hover: persistent, and dismissible after fix 3. onto the tooltip: hoverable, after finding 6's fix. |
| 2.1.1 Keyboard | Pass | tab order; arrows, Home and End (`bars.spec.ts`); every control is a button. NVDA A and C. |
| 2.1.2 No keyboard trap | Pass | tab order, both ways. |
| 2.1.4 Character key shortcuts | Pass | None. |
| 2.2.2 Pause, stop, hide | Pass | 5 s. Only hover and updates move anything, and each ends within 2 s. |
| 2.3.1 Three flashes | Pass | `flash` blinks once per change; a metric switch flashes every bar once. |
| 2.4.1 Bypass blocks | Pass | axe (`bypass`); headings and a `main` landmark. |
| 2.4.2 Page titled | Pass | axe (`document-title`). |
| 2.4.3 Focus order | Pass | tab order, pinned in the spec: the motion switch, metric, sort, Play next matchweek, the chart, its table, the hand-written chart. |
| 2.4.4 Link purpose | Not applicable | No links. (At the audit there was one, "the prototype", in a sentence that said what it was.) |
| 2.4.5 Multiple ways | Pass | `index.html` links every demo. |
| 2.4.6 Headings and labels | Pass | Each card's heading names its chart; each toggle group is named. |
| 2.4.7 Focus visible | Pass | tab order checks every stop; `bars.spec.ts` pictures the ring on both charts. |
| 2.4.11 Focus not obscured | Pass | ring: the tooltip never overlaps the ring. |
| 2.5.1 Pointer gestures | Pass | Pointing and clicking only. |
| 2.5.2 Pointer cancellation | Pass | Buttons act on release; a tap hovers on click. |
| 2.5.3 Label in name | Pass | Every button's name is its text; each bar's name starts with the player shown beside it. |
| 2.5.7 Dragging movements | Pass | Nothing is dragged. |
| 2.5.8 Target size (minimum) | Pass | axe (`target-size`). Bars are 34 px tall, the hand-written ones 19 px with 13 px between. |
| 3.1.1 Language of page | Pass | axe (`html-has-lang`). |
| 3.2.1 On focus | Pass | Focus plays the hover story; nothing else changes. |
| 3.2.2 On input | Pass | Toggles and Play next matchweek change the chart they're beside, which their names say. |
| 3.2.3, 3.2.4 Consistency | Pass | The motion switch is the same control, in the same place, on every page. |
| 3.3.2 Labels or instructions | Pass | Every control's text is its label. |
| 4.1.2 Name, role, value | Pass | axe; toggles are `aria-pressed`. NVDA A and C. |
| 4.1.3 Status messages | Pass | Each matchweek and re-sort is announced in a polite live region (NVDA A, steps 5–8). |
| Reduced motion (rule 6; 2.3.3 is AAA) | Pass | `reduced-motion.spec.ts`: the device's setting turns motion off until the viewer picks a mode, and every story shows its end at once. |
| Forced colours (not in WCAG) | Pass | forced; axe under forced colours. Fix 5. |

### donut.html

The library's `donutChart` and columns on `barChart`, and a D3 pie through `expressive()`, with the effect picker and Next match.

| Criterion | Result | Evidence |
| --- | --- | --- |
| 1.1.1 Non-text content | Pass | axe. Each slice an image named "Saved: 112 shots, 28%"; the total in the hole is the group's description, and hidden itself. NVDA D. |
| 1.3.1 Info and relationships | Pass | axe. The table's Share column and total row read with their headers (NVDA D, steps 7–9). |
| 1.3.2 Meaningful sequence | Pass | Slices go clockwise from 12 o'clock in the DOM and on the keys, following Largest first (NVDA D, step 13). |
| 1.3.3 Sensory characteristics | Pass | Instructions name controls. "Clockwise" describes the order; the keys don't depend on seeing it. |
| 1.3.4 Orientation | Pass | reflow. |
| 1.4.1 Use of colour | Pass | Each slice is labelled with its outcome and share round the ring; the legend's colours repeat those words. |
| 1.4.3 Contrast (minimum) | Pass (fixed) | axe after fix 1; [Contrast](#contrast); contrast on hover, on the donut and the columns. |
| 1.4.4 Resize text | Pass | reflow. |
| 1.4.5 Images of text | Pass | All text is text. |
| 1.4.10 Reflow | Pass | reflow and axe at 320 px. |
| 1.4.11 Non-text contrast | Pass | [Contrast](#contrast). Slices are separated by a 2 px line in the surface colour. |
| 1.4.12 Text spacing | Pass | spacing. |
| 1.4.13 Content on hover or focus | Pass (fixed) | hover and onto the tooltip, on the donut and the columns. Finding 6. |
| 2.1.1 Keyboard | Pass | tab order; arrows round the ring (`donut.spec.ts`); the picker keeps focus, and each chart's tab stop, the D3 pie's too since M9 (`donut.spec.ts`). NVDA D, J 11–14. |
| 2.1.2 No keyboard trap | Pass | tab order, both ways. |
| 2.1.4 Character key shortcuts | Pass | None. |
| 2.2.2 Pause, stop, hide | Pass | 5 s. A pulse ends within 5 s; flashes after a match end within 2 s. |
| 2.3.1 Three flashes | Pass | A flash blinks once. A pulse rings twice in 1.2 s (0.4 s in Analysis), round one slice: under three a second, and far under the area the general flash threshold counts. |
| 2.4.1, 2.4.2 | Pass | axe. |
| 2.4.3 Focus order | Pass | tab order: the motion switch, the hover effect, the order, Next match, the donut, its table, the pie, the columns, their table. |
| 2.4.6 Headings and labels | Pass | Card headings; the groups are named Hover effect and Order. |
| 2.4.7 Focus visible | Pass | tab order; `donut.spec.ts` pictures the ring on both donuts. |
| 2.4.11 Focus not obscured | Pass | ring, on the donut and the columns. |
| 2.5.1, 2.5.2, 2.5.7 | Pass | Pointing and clicking only; buttons act on release. |
| 2.5.3 Label in name | Pass | Button text is its name; a slice's name starts with the outcome on its label. |
| 2.5.8 Target size (minimum) | Pass | axe. The smallest slice is about 84 × 68 px. |
| 3.1.1 Language of page | Pass | axe. |
| 3.2.1, 3.2.2 | Pass | Focus plays the effect; the picker swaps effects in place with `update({ on })` on all three charts, keeping focus and each tab stop. Before M9 it attached the D3 pie's effects again, which sent its tab stop back to its first slice. |
| 3.2.3, 3.2.4 Consistency | Pass | The motion switch as on every page. |
| 3.3.2 Labels or instructions | Pass | Every control's text is its label. |
| 4.1.2 Name, role, value | Pass | axe. NVDA D. |
| 4.1.3 Status messages | Pass | Each match announced once, by the donut (NVDA D, step 4). |
| Reduced motion | Pass | `donut.spec.ts`: hover shows the ball at its end, and a match jumps to its end with no flash. |
| Forced colours | Pass | forced; the donut's legend keeps its colours. Fix 5. |

### line.html

The library's `lineChart` with `threshold` and a riding ball, a D3 line through `expressive()`, the same two again over a season with missing weeks (since M8, [below](#with-missing-weeks-m8)), and a Vega-Lite line through `fromVegaView()`, with Play season and a scrubber.

| Criterion | Result | Evidence |
| --- | --- | --- |
| 1.1.1 Non-text content | Pass (fixed) | axe, after fix 2. Each week is an image named "Matchweek 12: 18 goals, 19.0 xG"; each host line is named for the season, and Chrome's tree for the Vega-Lite line is the D3 line's. NVDA E 1–14. |
| 1.3.1 Info and relationships | Pass | axe. The table's Difference column reads with its header (NVDA E, steps 8–10). |
| 1.3.2 Meaningful sequence | Pass | Weeks are in order in the DOM and on the keys. |
| 1.3.3 Sensory characteristics | Pass | "Turns red" describes the chart; the Difference column and the tooltip say the same in words. |
| 1.3.4 Orientation | Pass | reflow. |
| 1.4.1 Use of colour | Pass | The threshold's red has a legend entry, "Goals below xG", and the Difference column and the tooltip's "vs expected" line say it. xG is dashed as well as grey. |
| 1.4.3 Contrast (minimum) | Pass (fixed) | axe after fix 1; [Contrast](#contrast); contrast on hover. The line chart doesn't dim. |
| 1.4.4 Resize text | Pass | reflow. |
| 1.4.5 Images of text | Pass | All text is text. |
| 1.4.10 Reflow | Pass | reflow and axe at 320 px: the cards stack, the line charts lay out again, the D3 and Vega-Lite lines scale. |
| 1.4.11 Non-text contrast | Pass | [Contrast](#contrast): both lines, the red, the ring. The scrubber is the browser's own. |
| 1.4.12 Text spacing | Pass | spacing. |
| 1.4.13 Content on hover or focus | Pass (fixed) | hover and onto the tooltip, on the crosshair's tooltip. Finding 6. |
| 2.1.1 Keyboard | Pass | tab order; weeks by arrow key, and since M8 by Page Up and Page Down, 4 weeks at a time; the scrubber by arrows, Play by Space, each host line by arrow key (`line.spec.ts`). NVDA E 1–14, I 2–5. |
| 2.1.2 No keyboard trap | Pass | tab order, both ways. |
| 2.1.4 Character key shortcuts | Pass | None. |
| 2.2.2 Pause, stop, hide | Pass | Play season, about 6.5 s, starts only when pressed, and Pause stops it (`line.spec.ts`). 5 s: the ball's first trip at load ends within 1.4 s. |
| 2.3.1 Three flashes | Pass | Nothing flashes. |
| 2.4.1, 2.4.2 | Pass | axe. |
| 2.4.3 Focus order | Pass | tab order: the motion switch, Play season, the scrubber, since M10 the four toggles ([below](#the-toggles-and-a-hover-on-one-point-m10)), the chart, its table, the D3 line, the chart with missing weeks, its table, its D3 line, the Vega-Lite line. |
| 2.4.6 Headings and labels | Pass | Card headings; the scrubber is named Matchweek, and says its value as "Through matchweek 38". |
| 2.4.7 Focus visible | Pass | tab order; `line.spec.ts` pictures the ring on each chart. |
| 2.4.11 Focus not obscured | Pass | ring: the tooltip sits above the highest point, clear of the rings, at every week. |
| 2.5.1, 2.5.2 | Pass | Pointing and clicking only. |
| 2.5.3 Label in name | Pass | Play's name is its text, "Play season" or "Pause". |
| 2.5.7 Dragging movements | Pass | The scrubber can be dragged, or clicked on its track, or moved by keys. |
| 2.5.8 Target size (minimum) | Pass | axe. Weeks and host lines: judgement call. |
| 3.1.1 Language of page | Pass | axe. |
| 3.2.1, 3.2.2 | Pass | Focus shows the week; the scrubber seeks the four charts that play, which its value says. |
| 3.2.3, 3.2.4 Consistency | Pass | The motion switch as on every page. |
| 3.3.2 Labels or instructions | Pass | The scrubber has no visible label of its own, but the status beside it says what it sets ("Through matchweek 38"), and its name says it too. |
| 4.1.2 Name, role, value | Pass (fixed) | axe after fix 2; the scrubber's value text; Play's name switches. NVDA E 1–14. |
| 4.1.3 Status messages | Pass | Nothing is announced while the season plays, on purpose: the scrubber's value says the week when it's read (NVDA E, step 6). |
| Reduced motion | Pass | `line.spec.ts`: Play ends at once, with the colour and the ball drawn on all three charts, and on the charts with missing weeks a gap stays a gap (below). |
| Forced colours | Pass (fixed) | forced, after fix 4: the legends keep their colours. |

#### With missing weeks (M8)

The second pair of cards: the same season as a weekly data feed recorded it, with no values for matchweeks 9 and 10 and no xG for matchweeks 4 and 5, on `lineChart`, and on a D3 line drawn with `line().defined()` and described with `describe.line({ breaks })`. Both have the same decoration, and Play season and the scrubber drive them with the first two. The table above holds for them; these are the rows they add to. Script I's steps passed with NVDA + Chrome on 27 October 2026.

| Criterion | Result | Evidence |
| --- | --- | --- |
| 1.1.1 Non-text content | Pass | axe. A missing week is still an image, named by what it has and what's missing ("Matchweek 4: 4 goals, xG missing"; "Matchweek 9: goals missing, xG missing"), and a week with a value missing has no description, since there's no gap to give. Each D3 line is named for the season and the weeks it's missing ("Goals scored: 56 goals by matchweek 38, matchweeks 9 and 10 missing"). `line.spec.ts`; NVDA I 1–5, 11 and 12. |
| 1.3.1 Info and relationships | Pass | The table says "missing" in each cell with no value, the Difference column's too, so no cell is read as empty (`line.spec.ts`; NVDA I 7–10). |
| 1.3.3 Sensory characteristics | Pass | "A gap in the line" describes the chart; the names, the tooltip and the table say which weeks are missing. |
| 1.4.1 Use of colour | Pass | A missing week is a gap in its line, and it's named. Where xG is missing, goals below it aren't red, and the card and the design notes say why; the tooltip and the table give no gap there. |
| 1.4.11 Non-text contrast | Pass | As above. At a week with no values, the focus is a 2 px line in the focus colour where the crosshair is: 4.3:1 in light, 4.8:1 in dark (`line-gaps.test.ts`, `line.spec.ts`; judgement call, now a pass). |
| 1.4.13 Content on hover or focus | Pass | The crosshair's tooltip at a missing week shows and says what's missing (`line.spec.ts`). Hover and onto the tooltip run on the first line chart, the same chart with the same tooltip; they aren't run here, since ring expects the tooltip clear of the focus at every week, and at a week with no values it covers the top of the focus line (2.4.11). |
| 2.1.1 Keyboard | Pass | The arrow keys, and Page Up and Page Down, stop at a missing week as at any other (`line.spec.ts`; NVDA I 2–5). Each D3 line by arrow key. |
| 2.2.2 Pause, stop, hide | Pass | They play only with Play season, and stop with Pause. |
| 2.4.3 Focus order | Pass | tab order: after the first D3 line, the chart, its table and its D3 line, then the Vega-Lite line. |
| 2.4.7 Focus visible | Pass | tab order. At a week with no values there's no point to ring: a line in the focus colour shows the focus where the crosshair is, and stays after Escape (`line.spec.ts`; judgement call, now a pass). |
| 2.4.11 Focus not obscured | Pass | At a week with values the tooltip sits above the highest point, as on the first chart. At a week with none it sits at the crosshair's top, over the top of the focus line, which runs on below it. Escape hides it. |
| Reduced motion | Pass | `line.spec.ts`: with reduced motion and with Off, a gap stays a gap. Revealed into the gap, each line ends at matchweek 8 with its ball there; after Play, each ball is at the tip, past the gap, and no red is drawn in any gap. |
| Forced colours | Pass | forced: the D3 line's legend keeps its colours, as the first one's does. |

#### The toggles, and a hover on one point (M10)

Above the first chart, two groups of toggle buttons: Line, Straight or Curved (`update({ curve })`), and Hover, Each week or Nearest point (`update({ hover })`). They drive both `lineChart`s, the one with missing weeks too, and the Vega-Lite line follows Straight or Curved. With Nearest point, the pointer hovers the point nearest it, the points are the focus stops, and the other line dims. The tables above hold for the page at rest; these are the rows the toggles add to. Script K's steps passed with NVDA + Chrome on 28 October 2026, and the walk, the page in the browser at full width and at 320 px, found nothing to change.

| Criterion | Result | Evidence |
| --- | --- | --- |
| 1.1.1 Non-text content | Pass | axe, with Curved and Nearest point picked and a point focused, light and dark. Each point is an image named by its week and its one value ("Matchweek 12: 18 goals"; "Matchweek 4: 4 goals" where xG is missing), and described by the week's gap. The weeks' columns are hidden (`display="none"`), so they aren't read. Curved changes no name (`line.spec.ts`; NVDA K). |
| 1.3.1 Info and relationships | Pass | The toggles are two groups, named Line and Hover by their visible labels (`aria-labelledby`), each button `aria-pressed` (`line.spec.ts`). |
| 1.3.2 Meaningful sequence | Pass | The points are in the DOM line by line, in week order, as Left and Right go. |
| 1.3.3 Sensory characteristics | Pass | "Curved" and "the other line dims" describe what's seen; the names, the tooltip and the table say every value. |
| 1.4.1 Use of colour | Pass | A hovered point is told by its emphasis, by its ring when focused, and by the other line dimming; its value is in the tooltip and its name. |
| 1.4.3 Contrast (minimum) | Pass | axe, with the toggles picked. The toggles' labels are the pages' muted text on a card (5.04:1 light, 5.24:1 dark). Nearest point dims no text: `line.spec.ts` checks that every text in the chart, the end labels and the axes too, is drawn at full strength while a point is hovered or focused. |
| 1.4.10 Reflow | Pass | reflow and axe at 320 px: the toggles wrap, each label kept on a line with its buttons. |
| 1.4.11 Non-text contrast | Pass | The hovered point in its series' strong colour; the ring on a point, as on a week ([Contrast](#contrast)). The other line, its points and its decorations at 30%: judgement call, as for dimmed bars. A pressed toggle shows its wash and bold, and under forced colours the viewer's selection colours (forced). |
| 1.4.13 Content on hover or focus | Pass (fixed) | Persistent and dismissible: a point's tooltip stays while the pointer does, and Escape hides it until the pointer finds another point (`line.spec.ts`). Hoverable: from every point, at 1,000 and 320 px, the pointer goes straight onto its tooltip over the bridge, up or down, keeping the hover (`line.spec.ts`). Before the fix, from 14 points at 1,000 px and 51 at 320 px another point took the hover on the way ([finding 7](#what-it-found)). |
| 2.1.1 Keyboard | Pass | The toggles by Tab and Space. With Nearest point, Left and Right along a line, passing over a missing week; Up and Down between the lines, by where they're drawn, doing nothing where the other line is missing; Home, End, Page Up, Page Down and Escape (`line.spec.ts`; NVDA K 1–21). |
| 2.2.2 Pause, stop, hide | Pass | A change of curve eases in half a second in Presentation, and only when it's picked. |
| 2.4.3 Focus order | Pass | tab order: the four toggles after the scrubber, before the chart. A pick keeps focus on its button, and each chart's tab stop where it was: on the same week, or on a point at it, or on the week of the point (`line.spec.ts`; NVDA K 4–9, 19–20). |
| 2.4.6 Headings and labels | Pass | The groups' visible labels, Line and Hover, are their names. |
| 2.4.7 Focus visible | Pass | tab order; `line.spec.ts` pictures the ring on a point, light and dark. |
| 2.4.11 Focus not obscured | Pass | `line.spec.ts`: at every point of both lines, the tooltip is clear of the ring. |
| 2.5.3 Label in name | Pass | Each toggle's name is its text. |
| 2.5.8 Target size (minimum) | Pass | axe: each toggle is 30 px tall. With Nearest point, a point's target is all of the plot nearer it than any other point. |
| 3.2.1, 3.2.2 | Pass | A pick changes only the charts, which the card's note says; focus and the tab stops stay. |
| 4.1.2 Name, role, value | Pass | axe; the toggles are `aria-pressed`, and each point's name and description say its value. |
| 4.1.3 Status messages | Pass | A pick announces nothing: the pressed state is read on the button (NVDA K 4, 7). |
| Reduced motion | Pass | `line.spec.ts`: with reduced motion and with Off, Curved draws the curve at once, with the red and the ball where they end, and a point's hover shows at once, with no fade. |
| Forced colours | Pass | forced: a pressed toggle shows in the viewer's selection colours. |

### morph.html

The donut and the columns in one `chartSwitch`, with `morph()`, the V key and the Morph toggles, and since M9 a bar chart of the same shots beside it, largest first, in one `link()` with the switch.

| Criterion | Result | Evidence |
| --- | --- | --- |
| 1.1.1 Non-text content | Pass | axe, at rest and mid-switch. The bars beside the switch are a named group of named bars ("Off target: 149 shots"). NVDA F, J 15–19. |
| 1.3.1 Info and relationships | Pass | axe. Only the view shown can be read: the other is `inert` and `aria-hidden` (`morph.spec.ts`, from Chrome's tree; NVDA F, steps 8, 11, 12). The bars beside it, with their table, can always be read. |
| 1.3.2 Meaningful sequence | Pass | As on the donut page. |
| 1.3.3 Sensory characteristics | Pass | Instructions name controls and the V key. |
| 1.3.4 Orientation | Pass | reflow. |
| 1.4.1 Use of colour | Pass | Labels round the ring, under the columns and beside the bars name every outcome. A linked hover is told by emphasis and by the other marks dimming, and it's visual only. |
| 1.4.3 Contrast (minimum) | Pass (fixed) | axe after fix 1, which included the Morph label; contrast on hover, on the switch and the bars. |
| 1.4.4 Resize text | Pass | reflow. |
| 1.4.5 Images of text | Pass | All text is text. |
| 1.4.10 Reflow | Pass | reflow and axe at 320 px. |
| 1.4.11 Non-text contrast | Pass | [Contrast](#contrast). |
| 1.4.12 Text spacing | Pass | spacing. |
| 1.4.13 Content on hover or focus | Pass (fixed) | hover and onto the tooltip, on the switch and the bars. Finding 6. A linked chart shows no tooltip (`morph.spec.ts`). |
| 2.1.1 Keyboard | Pass | tab order; V on a slice or column switches, and focus follows its outcome (`morph.spec.ts`). The bars by arrow key, the view shown following them (`morph.spec.ts`). NVDA F, J 15–19. |
| 2.1.2 No keyboard trap | Pass | tab order, both ways. |
| 2.1.4 Character key shortcuts | Pass | V works only with focus on a mark (`morph.spec.ts`), which the criterion allows. |
| 2.2.2 Pause, stop, hide | Pass | A switch takes about 1 s and starts only when asked. 5 s. |
| 2.3.1 Three flashes | Pass | Nothing flashes. |
| 2.4.1, 2.4.2 | Pass | axe. |
| 2.4.3 Focus order | Pass | tab order: the motion switch, Show as columns, Drop, Unroll, the view shown, its table, the bars, their table. A switch keeps focus on the button, or moves it to the same outcome in the new view. A linked hover never moves focus (`morph.spec.ts`; NVDA J 15–19). |
| 2.4.6 Headings and labels | Pass | The button says the view it goes to; the toggles are a group named Morph. The bars' card is headed "Linked, largest first". |
| 2.4.7 Focus visible | Pass | tab order; `morph.spec.ts` pictures the ring after a switch. |
| 2.4.11 Focus not obscured | Pass | ring, on the switch and the bars. |
| 2.5.1, 2.5.2, 2.5.7 | Pass | Pointing and clicking only. |
| 2.5.3 Label in name | Pass | Each button's name is its text. |
| 2.5.8 Target size (minimum) | Pass | axe. |
| 3.1.1 Language of page | Pass | axe. |
| 3.2.1, 3.2.2 | Pass | Focus plays the effect, in the chart focused and, linked, in the other. The switch changes the view beside the button, which the button's name says, and announces it. The link holds across a switch, and across a new Morph pick, which links the rebuilt switch (`morph.spec.ts`). |
| 3.2.3, 3.2.4 Consistency | Pass | The motion switch as on every page. |
| 3.3.2 Labels or instructions | Pass | Every control's text is its label. |
| 4.1.2 Name, role, value | Pass | axe, mid-switch too. NVDA F. |
| 4.1.3 Status messages | Pass | The new view's name is announced when a switch lands (NVDA F, steps 3, 5, 6, 9). A linked hover announces nothing (NVDA J 15–19). |
| Reduced motion | Pass | `morph.spec.ts`: a switch lands at once until the viewer picks a mode. |
| Forced colours | Pass | forced. Fix 5. |

### season.html

The library's `barChart`, twice (goals per matchweek, and goals by player), and `lineChart`, with columns and a slope chart drawn with D3 through `expressive()`. Three of them are in one `link()`; the players' bars have `delta()`, the slope chart `label()` and `trace()`, and Play next matchweek moves every chart on a week. Since M10 the goals line has `delta()` too, past its end label and clear of xG's: only the goals line, since the two lines end close together and xG's change would land on it. Script K's steps 22–24 cover it, and passed with NVDA + Chrome on 28 October 2026, and the walk, the page in the browser at full width and at 320 px, found nothing to change.

| Criterion | Result | Evidence |
| --- | --- | --- |
| 1.1.1 Non-text content | Pass | axe. Each chart is a named group and each mark one named image ("Matchweek 13: 4 goals", "Matchweek 1: 7 shots", "Okafor: 1 goal at matchweek 1, 14 goals after matchweek 24, +13"). The ball, the pulses, the trace and the text `delta()` and `label()` draw are in `aria-hidden` overlays; what the text says is in the announcement, the players' table and the slope lines' names (M7 decision 16). The goals line's change, since M10, is in the announcement too ("Season to date: 43 goals +2, 39.7 xG +1.8."). NVDA H, K 22–24. |
| 1.3.1 Info and relationships | Pass | axe. The goals and line tables have the matchweek as row header, and the players' table its Change and Since matchweek 1 columns (NVDA H, steps 9–11). The toggles are a group named Linked marks, and each chart has a heading. |
| 1.3.2 Meaningful sequence | Pass | The two column charts come before the line in the DOM, as they're stacked on the left; the bars follow their sort, and the slope lines are in the players' order. |
| 1.3.3 Sensory characteristics | Pass | The instructions name controls and keys. "Lights up" describes what's seen; the names and tables don't depend on it. |
| 1.3.4 Orientation | Pass | reflow. |
| 1.4.1 Use of colour | Pass | A linked week is told by its emphasis and by every other mark dimming, and it's visual only: each value is in the names and the tables. xG is dashed as well as grey. The slope lines share one colour, each named at its end. |
| 1.4.3 Contrast (minimum) | Pass | axe, light and dark; [Contrast](#contrast); contrast on hover, on the goals chart, the line and the players' bars. `season.spec.ts`: a linked chart's labels stay at full strength while its columns dim. The D3 charts' names are the page's `--ink-2` (7.73:1 light, 9.72:1 dark), their ticks `--ec-text-muted`, and the text `label()` draws `--ec-text`, as is the goals line's change. |
| 1.4.4 Resize text | Pass | reflow. |
| 1.4.5 Images of text | Pass | All text is text. |
| 1.4.10 Reflow | Pass | reflow and axe at 320 px. `season.spec.ts`: after a matchweek at 320 px, with Okafor's bar at the end of its scale, every change stays inside its card's padding, with no sideways scroll: the players' chart keeps 28 px for them inside itself, with `room: 28` (M8). The goals line's change stays inside its card too, clear of both end labels, though the plot is narrow and the lines end close together (M10). Where the goals chart's week names would overlap, the chart draws every 2nd (at 320 px, and at 1,000 px in the suite's fonts), and where its values would, it leaves them out (at 320 px): each is in the names, the tooltip and the table. |
| 1.4.11 Non-text contrast | Pass | [Contrast](#contrast): the marks, the ring. Marks dimmed by a hover, linked or not: judgement call. |
| 1.4.12 Text spacing | Pass | spacing. The slope chart draws itself again when its names grow, so each change stays clear of its name. |
| 1.4.13 Content on hover or focus | Pass (fixed) | hover and onto the tooltip, on the three library charts. Finding 6. A linked chart shows no tooltip. |
| 2.1.1 Keyboard | Pass | tab order; `season.spec.ts`: the arrow keys in one linked chart, the others following, and Escape ending all three. Every control is a button. NVDA H. |
| 2.1.2 No keyboard trap | Pass | tab order, both ways. |
| 2.1.4 Character key shortcuts | Pass | None. |
| 2.2.2 Pause, stop, hide | Pass | 5 s. Nothing plays by itself: the slope chart's labels rise once at load, in 400 ms, and a matchweek, a hover and a trace each end within 2 s. |
| 2.3.1 Three flashes | Pass | `flash` blinks once for each player who scored. A pulse rings twice in 1.2 s, round one mark in each chart. |
| 2.4.1, 2.4.2 | Pass | axe. |
| 2.4.3 Focus order | Pass | tab order: the motion switch, Play next matchweek, Linked marks, the goals chart, its table, the D3 columns, the line, its table, the players' bars, their table, the slope chart. A linked hover never moves focus (`season.spec.ts`; NVDA H, steps 2 and 4). |
| 2.4.6 Headings and labels | Pass | Each card and each linked chart has a heading; the toggles are a group named Linked marks. |
| 2.4.7 Focus visible | Pass | tab order checks every stop. |
| 2.4.11 Focus not obscured | Pass | ring, on the three library charts. |
| 2.5.1, 2.5.2, 2.5.7 | Pass | Pointing and clicking only; buttons act on release. |
| 2.5.3 Label in name | Pass | Each button's name is its text. Each mark's name starts with what's shown beside it: its week, or its player. |
| 2.5.8 Target size (minimum) | Pass | axe. The weeks of the goals chart and the D3 columns are as wide as their weeks, side by side (17.6 px at matchweek 24 on a 1,000 px page, 11 px at matchweek 38), and the slope lines take the pointer on their 2.25 px strokes: judgement call, as for the line page's weeks. All are reached by keyboard, and every value is in the names and the tables. |
| 3.1.1 Language of page | Pass | axe. |
| 3.2.1, 3.2.2 | Pass | Focus plays the hover, in the chart focused and the two linked to it, and nothing else changes. Play next matchweek changes every chart, which the cards say; the toggles change only how linked weeks show. |
| 3.2.3, 3.2.4 Consistency | Pass | The motion switch as on every page. |
| 3.3.2 Labels or instructions | Pass | Every control's text is its label. |
| 4.1.2 Name, role, value | Pass | axe; the toggles are `aria-pressed`. NVDA H. |
| 4.1.3 Status messages | Pass | Each matchweek is announced once, by the players' chart, with each player who scored, their change and their total (`season.spec.ts`; NVDA H, steps 6 and 7). Since M10 it ends with the season to date and its change, which the goals line's `delta()` shows: "Season to date: 43 goals +2, 39.7 xG +1.8." (NVDA K 22–24). A linked hover announces nothing. |
| Reduced motion | Pass | `season.spec.ts`: with reduced motion and with Off, the changes, the goals line's too, and the slope chart's labels show at once, and a trace is whole. |
| Forced colours | Pass | forced; axe under forced colours. The line's legend keeps its colours. |

### shapes.html

A D3 scatter and an Observable Plot dot chart, whose dots are `<circle>`s, and a D3 curved line and a D3 area, whose marks are `<path>`s, each through `expressive()`, which reads them by their tags (M9). The curved line has `threshold` and a riding ball, and a picker swaps the four charts' hover effect in place. The charts are attachments, so they draw no tooltip and no data table. Script J's steps passed with NVDA + Chrome on 27 October 2026.

| Criterion | Result | Evidence |
| --- | --- | --- |
| 1.1.1 Non-text content | Pass | axe. Each chart is a named group, and each dot, curve and area one named image: "Okafor: 16 goals from 64 shots", "Okafor: 16 goals, 4 assists", "Shots on target: 177 in 38 matches". The goals curve's name says where it's red: "… below xG in matchweeks 1 to 6, 9 to 12, 20 to 23, 31 and 33 to 38". The names beside the dots, the axes and Plot's other groups are hidden, and the ball and the rings are in `aria-hidden` overlays (`shapes.spec.ts`). NVDA J 1–10. |
| 1.3.1 Info and relationships | Pass | axe. Each chart has a heading, and the picker is a group named Hover effect, by its visible label. There's no table: each dot's name gives its values, and the curves and areas are named by what they show, as the line page's D3 line is. Plot's own name for its dots' group ("dot") is taken off, so it isn't read as a group of its own (`shapes.spec.ts`). |
| 1.3.2 Meaningful sequence | Pass | The marks are in the DOM in the order the page drew them, which is the arrow keys' order: the dots top scorer first, the curves goals first, the areas on target first (`shapes.spec.ts`; NVDA J 2, 3 and 10). |
| 1.3.3 Sensory characteristics | Pass | The instructions name controls and keys. "Turns red" describes the curve; its name says the same weeks in words. |
| 1.3.4 Orientation | Pass | reflow. |
| 1.4.1 Use of colour | Pass | The curve's red has a legend entry, "Goals below xG", and the goals curve's name lists those weeks. xG is dashed as well as grey. The two areas are told apart by a legend, their names and a line in the card's colour between them; every dot is one colour, named beside it. |
| 1.4.3 Contrast (minimum) | Pass | axe, light and dark; [Contrast](#contrast). The names beside the dots are the page's `--ink-2` (7.73:1 light, 9.72:1 dark), the axes `--ec-text-muted`. Hover dims only the marks: `shapes.spec.ts` checks every text in each chart keeps its full strength while a mark is hovered. |
| 1.4.4 Resize text | Pass | reflow. |
| 1.4.5 Images of text | Pass | All text is text. |
| 1.4.10 Reflow | Pass | reflow and axe at 320 px: the cards stack, and the D3 charts and Plot's are drawn at least 280 px wide and scale down to fit. |
| 1.4.11 Non-text contrast | Pass | [Contrast](#contrast): the dots, the curves, the red, the areas, the ring. The areas meet with a 1.5 px line in the card's colour between them, as the donut's slices do, since their two colours are close in lightness. Dimmed marks while another is hovered: judgement call. |
| 1.4.12 Text spacing | Pass | spacing: no text in the four charts overlaps, or leaves its card. |
| 1.4.13 Content on hover or focus | Not applicable | Nothing appears on hover or focus but the effects, the emphasis and the dimming, which add no content: the attachments draw no tooltip. |
| 2.1.1 Keyboard | Pass | tab order; each chart's marks by the arrow keys, Home and End, in document order (`shapes.spec.ts`); every control is a button. NVDA J 1–9. |
| 2.1.2 No keyboard trap | Pass | tab order, both ways. |
| 2.1.4 Character key shortcuts | Pass | None. |
| 2.2.2 Pause, stop, hide | Pass | 5 s. The ball's first trip along the goals curve at load takes about 3 s, under the 5 s, and starts only at load; a pulse ends within 1.2 s, a flash within 0.9 s. |
| 2.3.1 Three flashes | Pass | A flash blinks once. A pulse rings twice in 1.2 s, round one mark. |
| 2.4.1, 2.4.2 | Pass | axe. |
| 2.4.3 Focus order | Pass | tab order: the motion switch, the hover effect, the scatter, Plot's chart, the curved line, the area. A pick keeps focus on the picker and each chart's tab stop where it was (`shapes.spec.ts`; NVDA J 4–6). |
| 2.4.6 Headings and labels | Pass | Each card's heading names its chart and the library that drew it; the picker's group is named by its label, Hover effect. |
| 2.4.7 Focus visible | Pass | tab order checks every stop; `shapes.spec.ts` pictures the ring on each chart. |
| 2.4.11 Focus not obscured | Pass | Nothing covers the ring: there's no tooltip. |
| 2.5.1, 2.5.2, 2.5.7 | Pass | Pointing and clicking only; buttons act on release. |
| 2.5.3 Label in name | Pass | Each button's name is its text; each dot's name starts with the player named beside it. |
| 2.5.8 Target size (minimum) | Pass | axe. The dots are 12 px across and placed by their values, and the curves take the pointer on their 2.25 px strokes: judgement call, as for the line page's weeks and lines. The areas are large. All are reached by keyboard, and their names give their values. |
| 3.1.1 Language of page | Pass | axe. |
| 3.2.1, 3.2.2 | Pass | Focus plays the hover effect, and nothing else changes. The picker changes only the hover effect, which its group's name says, swapping it in place with `update({ on })`. |
| 3.2.3, 3.2.4 Consistency | Pass | The motion switch as on every page. |
| 3.3.2 Labels or instructions | Pass | Every control's text is its label, and the picker's group has a visible one. |
| 4.1.2 Name, role, value | Pass | axe; the picker's buttons are `aria-pressed`. NVDA J. |
| 4.1.3 Status messages | Not applicable | Nothing changes but the effects, which aren't status: there's nothing to announce. |
| Reduced motion | Pass | `shapes.spec.ts`: with reduced motion, the ball is at the tip at load with the red drawn, and a hover shows its end state at once; in Off, a wiggle and a pulse show nothing. |
| Forced colours | Pass | forced: the curve's and the area's legends keep their colours, and the picker's pressed button shows in the selection colours. axe under forced colours. |
