# Screen-reader checks

These scripts check what a screen reader hears on the demo pages. Sections [A](#a-nvda--chrome-windows) and [B](#b-voiceover--safari-macos) check the ARIA roles of the reference bar chart on `demo/bars.html`, its data table and its live region. [Section C](#c-the-second-chart-expressive-on-the-pages-own-svg) checks the demo's second chart, which `expressive()` names the same way. [Section D](#d-the-donut-page-donutchart-and-a-d3-pie) checks `donutChart` and a D3 pie on `demo/donut.html`, [section E](#e-the-line-page-linechart-and-a-d3-line) checks `lineChart` and a D3 line on `demo/line.html`, [section F](#f-the-morph-page-a-chart-switch) checks the chart switch on `demo/morph.html`, [section G](#g-the-stress-pages-date-line-linechart-on-dates) checks a line on dates on `demo/stress.html`, [section H](#h-the-season-page-linked-hover-and-change-labels) checks linked hover and the change labels on `demo/season.html`, and [section I](#i-missing-values-page-up-and-page-down-and-the-season-page-again) checks what M8 adds: a line with missing values on `demo/line.html`, Page Up and Page Down on `demo/stress.html`, and the season page without its workarounds. Run them with one or both of NVDA + Chrome and VoiceOver + Safari. If something reads differently from what a script expects, or reads badly, [open an issue](https://github.com/Deaversbp/expressive-charts/issues) with what you heard, and the roles and labels can be adjusted to match.

**Result (October 2026): passed with NVDA + Chrome.** All 13 steps read as expected, so the roles stay as built. VoiceOver + Safari hasn't been run yet; see [Results](#results). **The donut page (section D) and the line page (section E) passed with NVDA + Chrome too (22 October 2026), and so did the morph page (section F, 23 October 2026).** Section C, section E's steps 13 and 14, and section G passed with NVDA + Chrome on 24 October 2026, and section H, the season page, on 26 October 2026. Section I, for 0.3.0, passed with NVDA + Chrome on 27 October 2026. The WCAG 2.2 AA audit, which these runs feed, is [a11y-audit.md](a11y-audit.md).

A screen reader reads the page aloud, so "hear" means real speech. You don't need the sound on, though: NVDA's Speech Viewer shows everything it says as text, and that text is the easiest thing to paste into an issue.

## What's being tested

- **The chart.** The `<svg>` is `role="group"`, named by the chart's `label`. Each bar is `role="img"`, named by its `aria-label` ("Okafor: 16 goals, 4 assists"). Bars are focusable with a roving tabindex, so the chart is one tab stop and the arrow keys move between bars. Inside a bar, the text and shapes are hidden, so its name is the only thing read. Each bar's description is `markDescription`'s text (by default a tooltip function's). The demo's tooltip names the position and both numbers, and its `markDescription` gives only the position, so each bar is read as its name and then its position ("Okafor: 16 goals", then "Forward"), never the name or numbers twice.
- **The data table.** A `<details>` "Data table" after the chart. It has a `<caption>` (the chart's label; visually hidden), column headers (`<th scope="col">`), and each player's name as the row header (`<th scope="row">`). It follows the sort and the data.
- **Announcements.** A polite live region (`role="status"`) says what each update changed. The demo turns it on (`announce`) and adds the matchweek.

## Setup

1. In the repo, run `npm install` once, then `npm run dev`. Open the `bars.html` page at the address Vite prints, for example `http://localhost:5173/bars.html`.
2. **Reload before you start.** The steps assume a fresh page: Goals, Highest first, after matchweek 24. The matchweeks are seeded, so matchweek 25 always changes the same players.
3. The motion mode doesn't change what's spoken. Off stops the ball rolling, if it distracts you.
4. The page's tab order: the three motion buttons, the three metric buttons, the two sort buttons, "Play next matchweek", the chart (one stop), then "Data table".

Role words and their order vary between versions and verbosity settings: "graphic" or "image", "grouping" or "group", the name before or after the role. That's fine. **What matters is under "Listen for".**

## Listen for (pass or fail)

1. Each bar is read **once, as one item**: the player and the values together ("Okafor: 16 goals"), never in pieces ("Okafor" … "16") and never twice.
2. Moving into the chart says its name once ("Harbor City FC: goals by player").
3. After each button press, the announcement in the step is read, without you moving anywhere.
4. In the table, moving along a row reads the column header with each cell, and moving down a column reads the player's name.
5. Nothing is read that you can't see, apart from the table's caption.

## Known, no need to report

- **The chart's name twice.** The page's section heading has the same text as the chart, so on the way in you may hear it as a region and then as a group.
- **The second chart** ("The same story on someone else's chart") has its own script, [section C](#c-the-second-chart-expressive-on-the-pages-own-svg). Sections A and B stop at the data table, before it.

## A. NVDA + Chrome (Windows)

Before you start:
- Install NVDA (free, from nvaccess.org) and start it from the Start menu or with Ctrl+Alt+N. It says "NVDA started", and its icon appears in the taskbar's hidden icons (the ^ arrow). If Space scrolls the page in step 3, NVDA isn't running.
- **The NVDA key** is Insert. On a keyboard without an easy Insert key, tick "Use Caps Lock as an NVDA modifier key" in the Welcome dialog (or later in NVDA's Settings > Keyboard), so NVDA+Space becomes Caps Lock+Space.
- Right-click NVDA's icon and choose Tools > Speech Viewer to see what it says as text.

Start in browse mode, NVDA's default. NVDA+Space switches between browse mode and focus mode, and NVDA says which one you're in. Letter keys such as T only jump around in browse mode.

| # | Do | Expect to hear (roughly) | What you heard |
| --- | --- | --- | --- |
| 1 | Press Tab 10 times from the top of the page, until focus reaches the first bar. | "Harbor City FC: goals by player, grouping", then "Okafor: 16 goals, graphic". The ball rolls along Okafor's bar. | |
| 2 | Down arrow twice (browse mode). | "graphic, Lindqvist: 10 goals", then "graphic, Moreau: 8 goals". In browse mode NVDA moves its own cursor and focus stays on Okafor; that's expected. | |
| 3 | NVDA+Space (focus mode), then Down arrow, End, Home. | "Lindqvist: 10 goals, graphic", "Castillo: 1 goal, graphic", "Okafor: 16 goals, graphic". The focus ring moves with each one. | |
| 4 | Escape, then NVDA+Space (back to browse mode). | Nothing for Escape (the story stops), then NVDA's browse-mode sound. | |
| 5 | Shift+Tab 4 times, to "Goals + assists". Press Space. | "Goals + assists, toggle button, not pressed", then "pressed", then the announcement "Harbor City FC: goals and assists by player". | |
| 6 | Tab 4 times, back into the chart. | "Harbor City FC: goals and assists by player, grouping", then "Okafor: 16 goals, 4 assists, graphic". | |
| 7 | Shift+Tab twice, to "A–Z". Press Space. | "A–Z, toggle button, not pressed" (perhaps "A Z"), then "pressed", then "Sorted A to Z". | |
| 8 | Tab once, to "Play next matchweek". Press Space. | "Play next matchweek, button", then "Matchweek 25: Lindqvist and Okafor changed". | |
| 9 | Tab once, into the chart. Then Up arrow 3 times (browse mode). | "Okafor: 17 goals, 4 assists, graphic". Then the bars above it in A–Z order, ending "graphic, Lindqvist: 11 goals, 8 assists". | |
| 10 | Tab once, to "Data table". Press Space. | "Data table, button, collapsed", then "expanded". | |
| 11 | Press T (next table). If nothing happens, you're in focus mode: press NVDA+Space until NVDA says "Browse mode", then T. | "Harbor City FC: goals and assists by player, table with 9 rows and 5 columns", then "row 1, column 1, Player". | |
| 12 | Ctrl+Alt+Down, then Ctrl+Alt+Right 4 times. | "row 2, Adeyemi". Then "Position, column 2, Midfielder", "Goals, column 3, 4", "Assists, column 4, 6", "Total, column 5, 10". | |
| 13 | Ctrl+Alt+Down. | "Castillo, row 3, 6": the row header with the new row. | |

## B. VoiceOver + Safari (macOS)

Before you start:
- In Safari, go to Settings > Advanced and turn on **"Press Tab to highlight each item on a webpage"**. Without it, Tab skips the chart.
- Turn VoiceOver on with Cmd+F5.
- Turn Quick Nav off (press Left and Right arrow together until VoiceOver says "Quick Nav off"). With it off, the plain arrow keys reach the chart.

VO means Control+Option.

| # | Do | Expect to hear (roughly) | What you heard |
| --- | --- | --- | --- |
| 1 | Press Tab 10 times, until focus reaches the first bar. | "Okafor: 16 goals, image", and "Harbor City FC: goals by player, group" (before it, or after a pause). | |
| 2 | Down arrow twice, then End, then Home. | "Lindqvist: 10 goals, image", "Moreau: 8 goals, image", "Castillo: 1 goal, image", "Okafor: 16 goals, image". The focus ring moves with each one. | |
| 3 | VO+Right, then VO+Left. | "Lindqvist: 10 goals, image", then "Okafor: 16 goals, image": one item per bar, never "Lindqvist" and "10" separately. | |
| 4 | Escape. Shift+Tab 4 times, to "Goals + assists". Press Space. | "Goals + assists, toggle button" (perhaps "not selected"), then "selected", then "Harbor City FC: goals and assists by player". | |
| 5 | Tab 4 times, back into the chart. | "Okafor: 16 goals, 4 assists, image", with the chart's new name ("… goals and assists by player, group"). | |
| 6 | Shift+Tab twice, to "A–Z". Press Space. | "A–Z, toggle button", "selected", then "Sorted A to Z". | |
| 7 | Tab once, to "Play next matchweek". Press Space. | "Play next matchweek, button", then "Matchweek 25: Lindqvist and Okafor changed". | |
| 8 | Tab once, into the chart, then Up arrow 3 times. | "Okafor: 17 goals, 4 assists, image", then "Novak …", "Moreau …", "Lindqvist: 11 goals, 8 assists, image". | |
| 9 | Tab once, to "Data table". Press Space. | "Data table, collapsed, disclosure triangle" (or "summary"), then "expanded". | |
| 10 | VO+Right until you reach the table. | "Harbor City FC: goals and assists by player, table, 5 columns, 9 rows" (in either order). | |
| 11 | VO+Down, then VO+Right 4 times. | "Adeyemi, row 2". Then each cell with its column header: "Midfielder, Position", "4, Goals", "6, Assists", "10, Total". | |
| 12 | VO+Down. | "6, Castillo", or the row header and value in some order. | |

## C. The second chart: `expressive()` on the page's own SVG

The card "The same story on someone else's chart" is an SVG the page draws itself, the way D3 code would, with effects, keyboard focus and names added by `expressive()`. It should read like the first chart:

- **The chart.** The `<svg>` is `role="group"`, named like the first chart: the page changes its `aria-label` with the metric.
- **The bars.** The page names each rect by what it shows ("Okafor: 4 assists") and hides its name and value texts. Focus moves by player, so `markLabel` names the rect that takes each player's focus with all their values ("Okafor: 16 goals, 4 assists"), and hides the player's other rect.
- It has no tooltip, data table or announcements of its own. The page words the names itself, so a value of 1 reads "1 goal".

Start from a fresh page (Goals, Highest first, after matchweek 24), with the setup from A or B. **Listen for:**

1. Each player is read **once, as one item**, with every value the bar shows: "Okafor: 16 goals, 4 assists". Never "Okafor: 4 assists" on its own, and never the name or a number by itself.
2. Moving into the chart says its name once.
3. A value of 1 reads "1 goal" or "1 assist".
4. Nothing is read that you can't see.

**NVDA + Chrome**, starting in browse mode:

| # | Do | Expect to hear (roughly) | What you heard |
| --- | --- | --- | --- |
| 1 | Press Tab 12 times from the top of the page: past the first chart and "Data table", to the second chart's first bar. | "Harbor City FC: goals by player, grouping", then "Okafor: 16 goals, graphic". The ball rolls along Okafor's bar. | |
| 2 | Down arrow twice (browse mode). | "graphic, Lindqvist: 10 goals", then "graphic, Moreau: 8 goals". Never "Lindqvist" or "10" on their own. | |
| 3 | NVDA+Space (focus mode), then End, then Home. | "Castillo: 1 goal, graphic", then "Okafor: 16 goals, graphic". The focus ring moves with each one. | |
| 4 | NVDA+Space (browse mode). Shift+Tab 6 times, to "Goals + assists". Press Space. | "Goals + assists, toggle button, not pressed", then "pressed", and the first chart's announcement. | |
| 5 | Tab 6 times, back into the second chart. | "Harbor City FC: goals and assists by player, grouping", then "Okafor: 16 goals, 4 assists, graphic". | |
| 6 | Shift+Tab 3 times, to "Play next matchweek". Press Space. Then Tab 3 times, back into the second chart. | "Matchweek 25: Lindqvist and Okafor changed" (the first chart's), then "Okafor: 17 goals, 4 assists, graphic". | |
| 7 | Down arrow 3 times (browse mode). | "Lindqvist: 11 goals, 8 assists", "Tanaka: 6 goals, 10 assists", "Moreau: 8 goals, 3 assists", each as one graphic. Never a player's assists on their own. | |

**VoiceOver + Safari**, with the settings from B:

| # | Do | Expect to hear (roughly) | What you heard |
| --- | --- | --- | --- |
| 1 | Press Tab 12 times, until focus reaches the second chart's first bar. | "Okafor: 16 goals, image", and "Harbor City FC: goals by player, group". | |
| 2 | Down arrow twice, then End, then Home. | "Lindqvist: 10 goals, image", "Moreau: 8 goals, image", "Castillo: 1 goal, image", "Okafor: 16 goals, image". | |
| 3 | VO+Right, then VO+Left. | "Lindqvist: 10 goals, image", then "Okafor: 16 goals, image": one item per bar. | |
| 4 | Shift+Tab 6 times, to "Goals + assists". Press Space. Then Tab 6 times, back into the chart. | "Okafor: 16 goals, 4 assists, image", with the chart's new name. | |
| 5 | VO+Right 3 times. | "Lindqvist: 10 goals, 7 assists, image", "Tanaka: 6 goals, 10 assists, image", "Moreau: 8 goals, 3 assists, image". Never a player's assists on their own. | |

If a bar is read twice or in pieces here but not on the first chart, the difference is the structure: here the named element is a `<rect>` inside the page's own `<g>` for each series, where the first chart has a `<g role="img">` per bar.

## D. The donut page: `donutChart` and a D3 pie

`demo/donut.html` shows a season's shot outcomes three ways: the library's `donutChart`, the same data as columns on `barChart`, and a pie the page draws with D3, which `expressive()` names. The columns are read like section A's bars, so this script covers the two donuts:

- **The donut.** The `<svg>` is `role="group"`, named by its label ("Shot outcomes"). The total in the hole is hidden, and its text is the group's description ("406 shots"), so it's heard on the way in. Each slice is `role="img"`, named by its category, its count and its share: "Saved: 112 shots, 28%". The labels round the ring are inside the slice and hidden, so the name is the only thing read.
- **Keyboard order.** The donut is one tab stop. The arrow keys go round the ring clockwise from 12 o'clock: Right and Down to the next slice, Left and Up to the previous, Home and End to the ends, with no wrap-around. In data order that's Goal, Saved, Off target, Blocked.
- **The data table.** Outcome, shots and a Share column, with a total row ("Total, 406, 100%") whose first cell is its row header.
- **Announcements.** "Next match" adds a match's shots. The donut announces it ("Match 1: Saved and Off target changed"); the other two charts don't, so it's heard once.
- **The D3 pie.** The page's `<svg>` is `role="group"`, named "Shot outcomes on a D3 pie", and its labels are hidden. `markLabel` names each slice as the donut does, and the arrow keys go clockwise from 12 o'clock, though D3 keeps its paths in data order.

**Setup.** Run `npm run dev` and open `donut.html` at the address Vite prints, for example `http://localhost:5173/donut.html`. **Reload before you start**, so the page is fresh: Ball, Data order, no matches added. The matches are seeded, so match 1 always adds 3 saved and 3 off target. The page's tab order: the three motion buttons, the three effect buttons (Ball, Wiggle, Pulse), the two order buttons, "Next match", the donut (one stop), its "Data table", the D3 pie (one stop), the columns (one stop), then their "Data table". Use NVDA + Chrome, with the setup from [A](#a-nvda--chrome-windows).

**Listen for:**

1. Each slice is read **once, as one item**, with its count and share: "Saved: 112 shots, 28%". Never the category, the number or the percentage on its own.
2. Moving into the donut says its name ("Shot outcomes") and, there or soon after, the total ("406 shots"). The "406" and "shots" in the hole are never read as text of their own.
3. The arrow keys go round clockwise from 12 o'clock and stop at the ends.
4. The table's Share column and total row are read with their headers.
5. "Next match" is announced once, with the match number, without you moving anywhere.
6. The D3 pie's slices are read like the donut's, and its labels aren't read at all.

**NVDA + Chrome**, starting in browse mode:

| # | Do | Expect to hear (roughly) | What you heard |
| --- | --- | --- | --- |
| 1 | Press Tab 10 times from the top of the page, until focus reaches the donut's first slice. | "Shot outcomes, grouping", perhaps with "406 shots" after it, then "Goal: 58 shots, 14%, graphic". The ball rolls round Goal. | |
| 2 | NVDA+Space (focus mode), then Right arrow 3 times. | "Saved: 112 shots, 28%, graphic", "Off target: 149 shots, 37%, graphic", "Blocked: 87 shots, 21%, graphic". The focus ring goes clockwise round the ring. | |
| 3 | Right arrow once more, then Home, End and Left arrow. | Nothing new for Right (Blocked is the last slice). Then "Goal: 58 shots, 14%", "Blocked: 87 shots, 21%", "Off target: 149 shots, 37%", each a graphic. | |
| 4 | Escape, then NVDA+Space (back to browse mode). Shift+Tab once, to "Next match". Press Space. | "Next match, button", then "Match 1: Saved and Off target changed". | |
| 5 | Tab once, back into the donut. | "Shot outcomes, grouping", perhaps with the new total, "412 shots", then "Off target: 152 shots, 37%, graphic", the slice focused last. | |
| 6 | Tab once, to "Data table". Press Space. | "Data table, button, collapsed", then "expanded". | |
| 7 | Press T (next table). If nothing happens, press NVDA+Space until NVDA says "Browse mode", then T. | "Shot outcomes, table with 6 rows and 3 columns", then "row 1, column 1, Outcome". | |
| 8 | Ctrl+Alt+Down, then Ctrl+Alt+Right twice. | "row 2, Goal". Then "shots, column 2, 58", "Share, column 3, 14%". | |
| 9 | Ctrl+Alt+Down 4 times, then Ctrl+Alt+Left. | "Saved, row 3, 28%", "Off target, row 4, 37%", "Blocked, row 5, 21%", "Total, row 6, 100%". Then "shots, column 2, 412". | |
| 10 | Press Tab, to the D3 pie. | "Shot outcomes on a D3 pie, grouping", then "Goal: 58 shots, 14%, graphic". The ball rolls round Goal on the pie. | |
| 11 | NVDA+Space (focus mode), then Right arrow 3 times, then Home. | "Saved: 115 shots, 28%", "Off target: 152 shots, 37%", "Blocked: 87 shots, 21%", then "Goal: 58 shots, 14%", each a graphic. Never "Saved" or "115" on its own. | |
| 12 | Escape, NVDA+Space (browse mode). Shift+Tab 4 times, to "Largest first". Press Space. | "Largest first, toggle button, not pressed", then "pressed", then the donut's "Sorted highest first". | |
| 13 | Tab 4 times, back into the D3 pie. NVDA+Space (focus mode), then Home and Right arrow. | "Goal: 58 shots, 14%, graphic" (the slice focused last). Then "Off target: 152 shots, 37%" and "Saved: 115 shots, 28%": the ring is largest first now, and the keys follow it. | |

If the total isn't heard in steps 1 and 5, it's still in the table's total row, but say so: the description may need to move into the group's name.

## E. The line page: `lineChart` and a D3 line

`demo/line.html` shows goals against expected goals over a season on the library's `lineChart`, and on a line the page draws with D3, which `expressive()` names. One "Play season" button and one scrubber drive both.

- **The line chart.** The `<svg>` is `role="group"`, named by its label ("Goals vs expected goals, season to date"), with a description in a `<desc>`: "Cumulative goals scored and expected goals over 38 matchweeks. The goals line is red wherever goals are below xG." The lines, dots, end labels, axes and the ball are hidden. Each matchweek is one focus stop, `role="img"`, named by `markLabel` with both values ("Matchweek 12: 18 goals, 19.0 xG"), and described by `markDescription` with only the gap ("-1.0 vs expected"), so nothing is read twice.
- **Keyboard order.** The chart is one tab stop. The arrow keys go one week at a time (Right and Down to the next, Left and Up to the previous), Home and End to the ends, with no wrap-around. Weeks past the scrubber's week are hidden and can't be reached, but the names and the table always cover the whole season.
- **The data table.** Matchweek, "Goals scored", "Expected goals (xG)" and Difference, a row per week, each named by its week. There's no total row.
- **The controls.** "Play season" is a button whose name says what a click does: "Pause" while it plays. The scrubber is a slider named "Matchweek" whose value is read as "Through matchweek 38". Nothing is announced while the season plays.
- **The D3 line.** The page's `<svg>` is `role="group"`, named "Goals and expected goals on a D3 line", and its axes are hidden. `markLabel` names each line for the whole season ("Goals scored: 56 goals by matchweek 38"), whatever the scrubber shows, as the line chart's names do. The arrow keys go from the goals line to the xG line.

**Setup.** Run `npm run dev` and open `line.html` at the address Vite prints, for example `http://localhost:5173/line.html`. **Reload before you start**, so the whole season shows. The page's tab order: the three motion buttons, "Play season", the scrubber, the line chart (one stop), its "Data table", then the D3 line (one stop). Use NVDA + Chrome, with the setup from [A](#a-nvda--chrome-windows). NVDA switches to focus mode on its own on the scrubber; where a step says "focus mode", press NVDA+Space until NVDA says "Focus mode".

**Listen for:**

1. Each matchweek is read **once, as one item**, with both values: "Matchweek 12: 18 goals, 19.0 xG". Then, perhaps after a pause, its gap: "-1.0 vs expected". Never the values twice, and never a number on its own.
2. Moving into the chart says its name once, and perhaps its description.
3. The arrow keys go one week at a time and stop at the ends. When only part of the season shows, they stop at the last week shown.
4. The scrubber is read as "Through matchweek …" as it moves, and nothing is read while the season plays.
5. The table's Difference column is read with its header, and each row is named by its matchweek.
6. The D3 line's two lines are each read once, by name.
7. Nothing is read that you can't see: not the end labels, the axes or the ball.

**Known, no need to report:** "-0.6" may be read "minus 0.6", "vs" as "versus", and "xG" as "x g". Do say if any of it is hard to follow: the page words the names and gaps itself, so they're easy to change.

**NVDA + Chrome**, starting in browse mode:

| # | Do | Expect to hear (roughly) | What you heard |
| --- | --- | --- | --- |
| 1 | Press Tab 6 times from the top of the page, until focus reaches the line chart's first week. | "Matchweek, slider, Through matchweek 38" on the way past the scrubber. Then "Goals vs expected goals, season to date, grouping", perhaps with its description, then "Matchweek 1: 0 goals, 0.6 xG, graphic", then "-0.6 vs expected". The crosshair and tooltip show at week 1. | |
| 2 | Focus mode, then Right arrow twice. | "Matchweek 2: 0 goals, 1.7 xG, graphic, -1.7 vs expected", then "Matchweek 3: 3 goals, 3.5 xG, graphic, -0.5 vs expected". The crosshair moves a week at a time. | |
| 3 | End, Left arrow, Home, then Left arrow again. | "Matchweek 38: 56 goals, 56.5 xG … -0.5 vs expected", "Matchweek 37: 55 goals, 55.1 xG … -0.1 vs expected", "Matchweek 1: 0 goals, 0.6 xG …", then nothing new: week 1 is the first. | |
| 4 | Shift+Tab once, to the scrubber. Press Home, then Right arrow 4 times. | "Matchweek, slider, Through matchweek 38". Then "Through matchweek 1", "Through matchweek 2" … "Through matchweek 5". Both charts glide back to week 5. | |
| 5 | Tab once, back into the line chart. Focus mode, then End, then Right arrow. | "Matchweek 1: 0 goals, 0.6 xG, graphic …" (the week focused last). Then "Matchweek 5: 4 goals, 6.0 xG, graphic, -2.0 vs expected": the last week shown. Then nothing new for Right. | |
| 6 | Shift+Tab twice, to "Play season". Press Space. Wait until the season stops (about 5 seconds), then press NVDA+Tab. | "Play season, button". Then nothing while it plays (perhaps "Pause" once, as the button's name changes). Then "Play season, button" again. | |
| 7 | Tab 3 times, to "Data table". Press Space. | "Data table, button, collapsed", then "expanded". | |
| 8 | Press T (next table). If nothing happens, press NVDA+Space until NVDA says "Browse mode", then T. | "Goals vs expected goals, season to date, table with 39 rows and 4 columns", then "row 1, column 1, Matchweek". | |
| 9 | Ctrl+Alt+Down, then Ctrl+Alt+Right 3 times. | "row 2, 1". Then "Goals scored, column 2, 0", "Expected goals (xG), column 3, 0.6", "Difference, column 4, -0.6". | |
| 10 | Ctrl+Alt+Down. | "2, row 3, -1.7": the row's matchweek with the new row. | |
| 11 | Press Tab, to the D3 line. | "Goals and expected goals on a D3 line, grouping", then "Goals scored: 56 goals by matchweek 38, graphic". | |
| 12 | Focus mode, then Right arrow twice, then Left arrow. | "Expected goals (xG): 56.5 by matchweek 38, graphic", then nothing new, then "Goals scored: 56 goals by matchweek 38, graphic". The focus ring goes round each line, and the other line dims. | |

If the chart's description isn't heard in step 1, it's also in the card's note, but say so: it may need to move.

**The Vega-Lite line.** Below the two charts, the page draws the season a third time as a Vega-Lite line, which `fromVegaView()` names. It doesn't play: it shows the whole season. Its `<svg>` is `role="group"`, named "Goals and expected goals on a Vega-Lite line"; Vega hides its axes (`aria-hidden`), and `markLabel` names each line as on the D3 line. Vega gives the groups around its lines roles of its own (`graphics-object`, `graphics-symbol`) with no names; since the accessibility audit, `fromVegaView()` takes those off, so Chrome's tree for this chart is the D3 line's: the group, then one image per line. It's one tab stop, after the D3 line. Listen for:

8. Each Vega-Lite line is read once, by name, and nothing unnamed (a "graphic" or "group" with no name) is read before it.

| # | Do | Expect to hear (roughly) | What you heard |
| --- | --- | --- | --- |
| 13 | After step 12, press Escape, then NVDA+Space (browse mode), then Tab. | "Goals and expected goals on a Vega-Lite line, grouping", then "Goals scored: 56 goals by matchweek 38, graphic". | |
| 14 | Focus mode, then Right arrow, then Left arrow. | "Expected goals (xG): 56.5 by matchweek 38, graphic", then "Goals scored: 56 goals by matchweek 38, graphic". The focus ring goes round each line, and the other line dims. | |

## F. The morph page: a chart switch

`demo/morph.html` shows a season's shot outcomes as a donut and as columns in one `chartSwitch`. A button switches between them, and the slices morph into their columns and back. This script covers what the switch adds; the donut reads as in [section D](#d-the-donut-page-donutchart-and-a-d3-pie) and the columns as section A's bars.

- **One view at a time.** Each view is a whole chart with its own legend and data table. The view that isn't shown is hidden from screen readers (`aria-hidden`) and can't be reached (`inert`). During a switch, about a second in Presentation, neither view can be read or reached.
- **The two charts.** The donut's `<svg>` is `role="group"`, named "Shot outcomes, share of total", and its slices are named as in section D ("Saved: 112 shots, 28%"). The columns' is named "Shot outcomes, counts", and each column "Saved: 112 shots".
- **The button.** "Show as columns" is a plain button whose name is the view a click goes to. It changes as soon as it's pressed, to "Show as donut", and focus stays on it. A second press mid-way switches back.
- **The announcement.** When a switch lands, a polite live region says the new view's name: "Shot outcomes, counts" or "Shot outcomes, share of total".
- **Focus follows its key.** With a slice or column focused, V switches too. When the switch lands, focus is on the same outcome in the other view, with its focus ring.
- **The Morph buttons.** "Drop" and "Unroll" are toggle buttons in a group named "Morph". They change how the shapes move, not what's read; a press rebuilds the switch in the view it was showing, with focus staying on the button.

**Setup.** Run `npm run dev` and open `morph.html` at the address Vite prints, for example `http://localhost:5173/morph.html`. **Reload before you start**, so the page is fresh: the donut showing, in Presentation. Leave the motion on Presentation, so each switch takes about a second. The page's tab order: the three motion buttons, "Show as columns", the two Morph buttons (Drop, Unroll), the chart shown (one stop), then its "Data table". Use NVDA + Chrome, with the setup from [A](#a-nvda--chrome-windows). V reaches the page only in focus mode; in browse mode NVDA keeps letter keys for itself.

**Listen for:**

1. Each slice and column is read **once, as one item**: "Saved: 112 shots, 28%" on the donut, "Saved: 112 shots" on the columns.
2. The button is read by the view it goes to: "Show as columns", then "Show as donut" after a press.
3. After each switch, the new view's name is announced once, about a second after the key press, without you moving anywhere.
4. After V on a slice, the same outcome is read in the columns ("Saved: 112 shots"), and after V on a column, in the donut.
5. Only the view shown is read. Reading down the card never reaches the other view's slices or columns, its legend or its table, and T finds one table.
6. Nothing is read that you can't see, apart from the table's caption and the announcement.

**Known, no need to report:** after V, NVDA may read the new chart's name twice: once as the group focus moves into, and once as the announcement. Do say if it's too much.

**NVDA + Chrome**, starting in browse mode:

| # | Do | Expect to hear (roughly) | What you heard |
| --- | --- | --- | --- |
| 1 | Press Tab 7 times from the top of the page, until focus reaches the donut's first slice. | On the way: "Show as columns, button", "Morph, grouping, Drop, toggle button, not pressed", "Unroll, toggle button, pressed". Then "Shot outcomes, share of total, grouping", perhaps with "406 shots", then "Goal: 58 shots, 14%, graphic". | |
| 2 | NVDA+Space (focus mode), then Right arrow. | "Saved: 112 shots, 28%, graphic". | |
| 3 | Press V. | Nothing for about a second while the slices turn into columns. Then "Shot outcomes, counts, grouping", "Saved: 112 shots, graphic", and the announcement "Shot outcomes, counts". The focus ring is on the Saved column. | |
| 4 | Right arrow, then Left arrow. | "Off target: 149 shots, graphic", then "Saved: 112 shots, graphic". Never a share ("28%"): those are the donut's. | |
| 5 | Press V again. | After about a second, "Shot outcomes, share of total, grouping", "Saved: 112 shots, 28%, graphic", and "Shot outcomes, share of total". The focus ring is on the Saved slice. | |
| 6 | Escape, then NVDA+Space (browse mode). Shift+Tab 3 times, to "Show as columns". Press Space. | "Show as columns, button". Then perhaps "Show as donut", as the name changes, and after about a second, "Shot outcomes, counts". | |
| 7 | Press NVDA+Tab. | "Show as donut, button": focus stayed on the button. | |
| 8 | Press Down arrow until you reach the heading "Two ways to morph". | "Morph", the Drop and Unroll buttons, the legend ("Goal", "Saved", "Off target", "Blocked"), "Shot outcomes, counts, grouping", the four columns ("Goal: 58 shots, graphic" … "Blocked: 87 shots, graphic"), "Data table, button, collapsed", then "Two ways to morph, heading, level 2". **Never** a slice, a share or the donut's "406 shots", and the legend only once. | |
| 9 | Press Shift+Tab until you're back on "Show as donut" (about 4 times), then press Space twice, quickly. | "Show as donut, button", then perhaps "Show as columns" and "Show as donut" as the name changes back. The columns start to turn into slices and go back. After about a second, one announcement: "Shot outcomes, counts". | |
| 10 | Press Tab 4 times, to "Data table". Press Space. | On the way, "Shot outcomes, counts, grouping" and "Goal: 58 shots, graphic". Then "Data table, button, collapsed", then "expanded". | |
| 11 | Press T (next table). If nothing happens, press NVDA+Space until NVDA says "Browse mode", then T. | "Shot outcomes, counts, table with 5 rows and 2 columns", then "row 1, column 1, Outcome". | |
| 12 | Press T again. | "No next table": the donut's table is hidden with the donut. | |
| 13 | Shift+Tab until you reach "Drop" (about 3 times), and press Space. | "Drop, toggle button, not pressed", then "pressed". Nothing else: the switch is rebuilt, still showing the columns, and focus stays on Drop. | |

If the announcement in steps 3, 5, 6 or 9 isn't heard, or is heard before the switch lands, say so: the live region is written when the switch lands, and could move.

## G. The stress page's date line: `lineChart` on dates

`demo/stress.html` runs each case at sizes up to past its limit. Its third card, "A line on dates, playing", is a `lineChart` whose x is a date: a year of daily visits and their 28-day average, red wherever a day is below its average, with a Play button. This script covers what dates add; otherwise the chart reads as in [section E](#e-the-line-page-linechart-and-a-d3-line).

- **The chart.** The `<svg>` is `role="group"`, named "Daily visits, 2025", with a description in a `<desc>`: "Visits each day and their 28-day average, 2025. The visits line is red wherever a day is below its 28-day average." The lines, dots, end labels, axes and the arrow are hidden. Each day is one focus stop, `role="img"`, named by the chart's default: the day as a medium date in the page's locale, then each series' value and name ("Jan 1, 2025: 959 Visits, 936 28-day average"). The page gives no tooltip function, so a day has no description.
- **Keyboard order.** The chart is one tab stop. The arrow keys go one day at a time (Right and Down to the next, Left and Up to the previous), Home and End to the ends, with no wrap-around.
- **The data table.** Date, Visits and 28-day average, a row per day, each named by its date ("Jan 1, 2025").
- **The controls.** The Years and Series buttons are toggle buttons in groups named "Years" and "Series"; a press draws the chart again, and focus stays on the button. "Play" plays the year in about 8 seconds, and is "Pause" while it plays. The date beside it ("Through Dec 31, 2025") isn't a live region. The readout under the controls is a polite live region, written once a play ends.

**Setup.** Run `npm run dev` and open `stress.html` at the address Vite prints, for example `http://localhost:5173/stress.html`. **Reload before you start**, so the card shows 1 year and 2 series in Presentation. Use NVDA + Chrome, with the setup from [A](#a-nvda--chrome-windows). To reach the card, press 2 (the next heading at level 2) until NVDA says "A line on dates, playing, heading, level 2".

**Listen for:**

1. Each day is read **once, as one item**, with its date and both values: "Jan 1, 2025: 959 Visits, 936 28-day average". Never a number on its own, and never twice.
2. Moving into the chart says its name once, and perhaps its description.
3. The arrow keys go one day at a time and stop at the ends.
4. Nothing is read while the year plays. When it ends, the readout is read once.
5. In the table, each row is named by its date, and each cell is read with its column's header.
6. Nothing is read that you can't see: not the end labels, the axes or the arrow.

**Known, no need to report:** "Visits" has a capital in the middle of a name, since it's the series' name in the legend too. The readout is long, and full of numbers: it's for measuring, not for reading. Do say if a date is read in a way that's hard to follow.

**NVDA + Chrome**, starting in browse mode:

| # | Do | Expect to hear (roughly) | What you heard |
| --- | --- | --- | --- |
| 1 | Press 2 until "A line on dates, playing, heading, level 2". Then press Tab 10 times. | On the way: "Years, grouping, 1, toggle button, pressed", "2", "5", "10", "Series, grouping, 1, toggle button, not pressed", "2, toggle button, pressed", "3", "4", "Play, button". Then "Daily visits, 2025, grouping", perhaps with its description, then "Jan 1, 2025: 959 Visits, 936 28-day average, graphic". | |
| 2 | NVDA+Space (focus mode), then Right arrow twice. | "Jan 2, 2025: 1,164 Visits, 941 28-day average, graphic", then "Jan 3, 2025: 1,077 Visits, 943 28-day average, graphic". The crosshair moves a day at a time. | |
| 3 | End, then Left arrow. | "Dec 31, 2025: 955 Visits, 848 28-day average, graphic", then "Dec 30, 2025: 1,117 Visits, 842 28-day average, graphic". | |
| 4 | Home, then Left arrow. | "Jan 1, 2025: 959 Visits, 936 28-day average, graphic", then nothing new: January 1 is the first day. | |
| 5 | Escape, then NVDA+Space (browse mode). Shift+Tab once, to "Play". Press Space, and wait until the year stops (about 8 seconds). | "Play, button". Nothing while it plays (perhaps "Pause" once, as the button's name changes). When it stops, the readout, once: "Smooth. Played 1 year of days, 2 series in Presentation: …", ending "Runs: 732 started, 366 of them on visits, 1 drawn." It may say "Not smooth". | |
| 6 | Tab twice, to "Data table". Press Space. | On the way, "Daily visits, 2025, grouping" and "Jan 1, 2025: …". Then "Data table, button, collapsed", then "expanded". | |
| 7 | Press T (next table). If nothing happens, press NVDA+Space until NVDA says "Browse mode", then T. | "Daily visits, 2025, table with 366 rows and 3 columns", then "row 1, column 1, Date". | |
| 8 | Ctrl+Alt+Down, then Ctrl+Alt+Right twice. | "row 2, Jan 1, 2025". Then "Visits, column 2, 959", "28-day average, column 3, 936". | |
| 9 | Ctrl+Alt+Down. | "Jan 2, 2025, row 3, 941": the row's date with the new row. | |
| 10 | Shift+Tab until "10, toggle button, not pressed" (the Years group; about 7 times). Press Space, and wait a few seconds while the chart is drawn again. Then Tab 6 times. | "10, toggle button, pressed". Then, on the way, "2, toggle button, pressed" and "Play, button", then "Daily visits, 2016 to 2025, grouping" and "Jan 1, 2016: 959 Visits, 934 28-day average, graphic". | |
| 11 | NVDA+Space (focus mode), Right arrow, then End. | "Jan 2, 2016: 838 Visits, 938 28-day average, graphic", then "Dec 31, 2025: 565 Visits, 503 28-day average, graphic". | |

Ten years are 3,653 days, and the arrow keys go a day at a time, so step 11 uses End. Since M8, Page Up and Page Down go a month at a time, 120 presses for the ten years: [section I](#i-missing-values-page-up-and-page-down-and-the-season-page-again) hears them.

## H. The season page: linked hover and change labels

`demo/season.html` shows Harbor City FC's season after 24 matchweeks. Its first three charts are in one `link()`: goals per matchweek on `barChart`, shots per matchweek on columns the page draws with D3, and goals against expected goals on `lineChart`. A week hovered or focused in one of them shows in the other two. "Play next matchweek" adds a week to every chart. The players' bars show each change since the last matchweek past the bar, with `delta()`, and a slope chart drawn with D3 shows each player's change since matchweek 1 past their name, with `label()`. This script covers what linked hover and the change labels add; otherwise the bars read as in [section A](#a-nvda--chrome-windows) and the line as in [section E](#e-the-line-page-linechart-and-a-d3-line).

- **Linked hover is visual only.** When focus moves week by week in one of the three charts, the other two show the same week, with no focus ring or tooltip there, and nothing is announced. Focus stays where it is.
- **Goals per matchweek.** The `<svg>` is `role="group"`, named "Goals per matchweek". Each week is one focus stop, `role="img"`, named by its goals ("Matchweek 13: 4 goals") and described by its xG and shots ("1.2 xG, 15 shots"). Its data table has Matchweek, Goals, xG and Shots: the D3 columns have no table of their own.
- **The D3 columns.** The page's `<svg>` is `role="group"`, named "Shots per matchweek on D3 columns", and its axes are hidden. `markLabel` names each column ("Matchweek 1: 7 shots"), and the arrow keys go week by week.
- **The line chart** reads as on the line page: each week named by both totals ("Matchweek 1: 2 goals, 0.6 xG") and described by the gap ("+1.4 vs expected").
- **The changes.** The text `delta()` draws past a bar ("+1") and `label()` past a name ("+13") is in an overlay that screen readers don't read, so the page says it in words too. The players' chart announces each matchweek: each player who scored, their change and their total ("Matchweek 25: Okafor +1, 15 goals; Lindqvist +1, 7 goals."), or "no goals". The players' table has a Change column, the last matchweek's, and a Since matchweek 1 column. Each slope line is named by both ends and its change ("Okafor: 1 goal at matchweek 1, 14 goals after matchweek 24, +13").

**Setup.** Run `npm run dev` and open `season.html` at the address Vite prints, for example `http://localhost:5173/season.html`. **Reload before you start**, so the page is after matchweek 24. The page's tab order: the three motion buttons, "Play next matchweek", the two Linked marks buttons (Full hover, Emphasis only), the goals per matchweek (one stop), its "Data table", the D3 columns (one stop), the line chart (one stop), its "Data table", the players' bars (one stop), their "Data table", then the slope chart (one stop). Use NVDA + Chrome, with the setup from [A](#a-nvda--chrome-windows), and keep the pointer off the charts: a chart under the pointer shows its own hover.

**Listen for:**

1. A focused week is read **once**, from the chart that has focus: never another chart's name for the same week, and nothing is announced as you move.
2. Focus stays in the chart you're in. The other two charts show the week, but NVDA+Tab still reads the week you're on.
3. Each matchweek is announced once, after the button press, with each player who scored, their change and their total, or "no goals".
4. The players' table reads its Change and Since matchweek 1 columns with their headers, and they say what's drawn past the bars and the names.
5. Each slope line is read once, as one item, with both ends and its change.
6. Nothing is read that you can't see, and the changes drawn past the bars and names are never read on their own: they're in the announcement, the table and the lines' names.

**Known, no need to report:** "+1" may be read "plus 1", and "xG" "x g". A matchweek adds a week to the goals chart, the D3 columns and the line without announcing it there: the players' announcement covers the matchweek, and the new week is in each chart's names and tables.

**NVDA + Chrome**, starting in browse mode:

| # | Do | Expect to hear (roughly) | What you heard |
| --- | --- | --- | --- |
| 1 | Press Tab 7 times from the top of the page, until focus reaches the first week of "Goals per matchweek". | On the way: "Play next matchweek, button", "Linked marks, grouping, Full hover, toggle button, pressed", "Emphasis only, toggle button, not pressed". Then "Goals per matchweek, grouping", "Matchweek 1: 2 goals, graphic", then "0.6 xG, 7 shots". Week 1 lights up on the D3 columns and the line too, with no ring or tooltip there. | |
| 2 | NVDA+Space (focus mode), then Right arrow twice, then NVDA+Tab. | "Matchweek 2: 0 goals, graphic, 1.9 xG, 14 shots", "Matchweek 3: 1 goal, graphic, 2.5 xG, 19 shots", then "Matchweek 3: 1 goal, graphic" again: focus stayed. Week 3 lights up on the other two charts, and nothing of theirs is read. | |
| 3 | Escape, then NVDA+Space (browse mode). Tab twice. | Nothing for Escape: all three charts go back to rest. Then "Data table, button, collapsed", then "Shots per matchweek on D3 columns, grouping", "Matchweek 1: 7 shots, graphic". Week 1 lights up on the goals chart and the line. | |
| 4 | Focus mode, then End, then NVDA+Tab. | "Matchweek 24: 10 shots, graphic", then the same again: focus stayed on the D3 columns. Week 24 lights up on the other two, and nothing of theirs is read. | |
| 5 | Escape, browse mode, then Tab. | "Goals vs expected goals, season to date, grouping", perhaps with "Goals scored and expected goals so far, week by week.", then "Matchweek 1: 2 goals, 0.6 xG, graphic", then "+1.4 vs expected". Week 1 lights up on the two column charts. | |
| 6 | Escape, browse mode. Shift+Tab 6 times, to "Play next matchweek". Press Space. | On the way, each chart's week where you left it. Then "Play next matchweek, button", and the announcement "Matchweek 25: Okafor +1, 15 goals; Lindqvist +1, 7 goals." "+1" rises past Okafor's and Lindqvist's bars. | |
| 7 | Press Space again. | "Matchweek 26: Lindqvist +1, 8 goals." Okafor's "+1" goes: only this matchweek's changes are drawn. | |
| 8 | Tab 9 times, to the players' "Data table". Press Space. | On the way, "Goals by player, grouping", "Okafor: 15 goals, graphic", "Forward". Then "Data table, button, collapsed", then "expanded". | |
| 9 | Press T (next table). If nothing happens, press NVDA+Space until NVDA says "Browse mode", then T. | "Goals by player, table with 9 rows and 5 columns", then "row 1, column 1, Player". | |
| 10 | Ctrl+Alt+Down, then Ctrl+Alt+Right 4 times. | "row 2, Okafor". Then "Position, column 2, Forward", "Goals, column 3, 15", "Change, column 4, 0", "Since matchweek 1, column 5, +14". | |
| 11 | Ctrl+Alt+Down, then Ctrl+Alt+Left. | "Lindqvist, row 3, +8", then "Change, column 4, +1": the change drawn past his bar. | |
| 12 | Press Tab, to the slope chart. | "Goals by player at matchweek 1 and now, on a D3 slope chart, grouping", then "Okafor: 1 goal at matchweek 1, 15 goals after matchweek 26, +14, graphic". Okafor's line is traced, and the others dim. | |
| 13 | Focus mode, then Right arrow, then End. | "Lindqvist: 0 goals at matchweek 1, 8 goals after matchweek 26, +8, graphic", then "Castillo: 0 goals at matchweek 1, 0 goals after matchweek 26, no change, graphic". Never "+8" or a name on its own. | |

If a linked chart's week is read in step 2 or 4, or the announcement in step 6 or 7 isn't heard, say so: linked hover would then not be visual only, or the changes would be drawn but not said.

## I. Missing values, Page Up and Page Down, and the season page again

M8 (0.3.0) adds three things to hear: a line with missing values, on the line page's card "With missing weeks"; Page Up and Page Down, which every chart now has, on the stress page; and the season page, which now leaves to the library what it used to do itself. Otherwise the charts read as in sections [E](#e-the-line-page-linechart-and-a-d3-line), [G](#g-the-stress-pages-date-line-linechart-on-dates) and [H](#h-the-season-page-linked-hover-and-change-labels).

- **The line with missing weeks.** The same season as section E's, as a weekly data feed recorded it: no values for matchweeks 9 and 10, and no xG for matchweeks 4 and 5. A missing value is a gap in its line. The `<svg>` is `role="group"`, named "Goals vs expected goals, with missing weeks", and its description says which weeks are missing. A missing week keeps its focus stop, named by what it has and what's missing ("Matchweek 4: 4 goals, xG missing"; "Matchweek 9: goals missing, xG missing"). A week with both values is described by its gap, as in section E; a week with one missing has no description, since there's no gap to give. At a week with no values there's no point to ring, so a line in the focus colour shows the focus where the crosshair is.
- **Its table.** As section E's, with "missing" in each cell that has no value, the Difference column's too.
- **The D3 line with missing weeks.** The page draws it with `line().defined()`, which breaks each path at a missing week. Its `<svg>` is `role="group"`, named "Goals and expected goals with missing weeks on a D3 line". `markLabel` names each line for the whole season and the weeks it's missing ("Goals scored: 56 goals by matchweek 38, matchweeks 9 and 10 missing").
- **Page Up and Page Down** move focus a page at a time, and stop at the ends, as the arrow keys do. On a line on dates, a page is a calendar month: to the first day a month or more on, or back. Elsewhere it's a tenth of the marks, rounded up: 4 of the line page's 38 weeks, and 10 of the stress page's 100 bars.
- **The season page** no longer clears the players' changes before each matchweek, works out `delta()`'s value, sizes the slope chart's labels, leaves room beside the bars or thins the goals chart's week names with its own code: the library does each of these. What's heard shouldn't change.

**Setup.** Run `npm run dev`. Use NVDA + Chrome, with the setup from [A](#a-nvda--chrome-windows), and keep the pointer off the charts. Each part starts on a freshly loaded page.

**Listen for:**

1. A missing week is read **once, as one item**, saying what's missing: "Matchweek 9: goals missing, xG missing". Never a 0 or "no goals" for a missing value, and never a gap ("vs expected") for a week with a value missing.
2. The arrow keys, and Page Up and Page Down, stop at a missing week as at any other.
3. In the table, a missing value is read as "missing", with its column's header.
4. Each D3 line is read once, by name, with the weeks it's missing.
5. Page Up and Page Down go a page at a time: a tenth of the weeks or bars, or a month on the date line. They stop at the ends.
6. The season page's announcements and table read as in section H.

**Known, no need to report:** as in sections E, G and H. In browse mode, NVDA may take Page Up and Page Down itself, so each step switches to focus mode first.

**The line page.** Open `line.html` at the address Vite prints, for example `http://localhost:5173/line.html`, and reload.

| # | Do | Expect to hear (roughly) | What you heard |
| --- | --- | --- | --- |
| 1 | Press 2 until "With missing weeks, heading, level 2". Then press Tab. | "Goals vs expected goals, with missing weeks, grouping", perhaps with its description ("… It has no values for matchweeks 9 and 10, and no xG for matchweeks 4 and 5 …"). Then "Matchweek 1: 0 goals, 0.6 xG, graphic", then "-0.6 vs expected". | |
| 2 | NVDA+Space (focus mode), then Right arrow 3 times. | "Matchweek 2: 0 goals, 1.7 xG, graphic, -1.7 vs expected", "Matchweek 3: 3 goals, 3.5 xG, graphic, -0.5 vs expected", then "Matchweek 4: 4 goals, xG missing, graphic", with nothing after it. | |
| 3 | Page Down, then Right arrow. | "Matchweek 8: 12 goals, 12.2 xG, graphic, -0.2 vs expected": 4 weeks on. Then "Matchweek 9: goals missing, xG missing, graphic". A blue line stands at week 9, where the crosshair is, with the tooltip "Matchweek 9, goals missing · xG missing", and there's no ring. | |
| 4 | Right arrow twice. | "Matchweek 10: goals missing, xG missing, graphic", then "Matchweek 11: 14 goals, 16.6 xG, graphic, -2.6 vs expected". | |
| 5 | Page Up 3 times, then once more. | "Matchweek 7: 10 goals, 10.0 xG, graphic, +0.0 vs expected", "Matchweek 3: …", "Matchweek 1: 0 goals, 0.6 xG, graphic …", then nothing new: week 1 is the first. | |
| 6 | Escape, then NVDA+Space (browse mode). Tab once, to "Data table", and press Space. | "Data table, button, collapsed", then "expanded". | |
| 7 | Press T (next table). If nothing happens, press NVDA+Space until NVDA says "Browse mode", then T. | "Goals vs expected goals, with missing weeks, table with 39 rows and 4 columns", then "row 1, column 1, Matchweek". | |
| 8 | Ctrl+Alt+Down 4 times, then Ctrl+Alt+Right 3 times. | "row 2, 1" … "row 5, 4". Then "Goals scored, column 2, 4", "Expected goals (xG), column 3, missing", "Difference, column 4, missing". | |
| 9 | Ctrl+Alt+Down 5 times. | Down the Difference column: "5, row 6, missing", "6, row 7, -1.3", "7, row 8, +0.0", "8, row 9, -0.2", "9, row 10, missing". | |
| 10 | Ctrl+Alt+Left twice. | "Expected goals (xG), column 3, missing", then "Goals scored, column 2, missing": week 9 has neither. | |
| 11 | Press Tab, to the D3 line with missing weeks. | "Goals and expected goals with missing weeks on a D3 line, grouping", then "Goals scored: 56 goals by matchweek 38, matchweeks 9 and 10 missing, graphic". | |
| 12 | Focus mode, then Right arrow. | "Expected goals (xG): 56.5 by matchweek 38, matchweeks 4, 5, 9 and 10 missing, graphic". The focus ring goes round the xG line, and the goals line dims. | |

**The stress page.** Open `stress.html` and reload, so its cards show their smallest sizes, and the date line 1 year and 2 series.

| # | Do | Expect to hear (roughly) | What you heard |
| --- | --- | --- | --- |
| 13 | Press 2 until "Hover on a large chart, heading, level 2". Then press Tab 7 times. | On the way: "Bars, grouping, 100, toggle button, pressed", "500", "1,000", "2,000", "5,000", "Sweep across, button". Then "100 bars, grouping", then "Bar 1: 10 points, graphic". Only some of the bars' names are drawn under them, but every bar is read by its name and value. | |
| 14 | NVDA+Space (focus mode), then Page Down twice, then Page Up. | "Bar 11: 14 points, graphic", "Bar 21: 11 points, graphic", then "Bar 11: 14 points, graphic" again. | |
| 15 | End, Page Down, then Page Up. | "Bar 100: 90 points, graphic", nothing new for Page Down, then "Bar 90: 78 points, graphic". | |
| 16 | Escape, then NVDA+Space (browse mode). Press 2 until "A line on dates, playing, heading, level 2". Then press Tab 10 times. | As section G's step 1, ending "Daily visits, 2025, grouping", then "Jan 1, 2025: 959 Visits, 936 28-day average, graphic". | |
| 17 | Focus mode, then Page Down twice, then Page Up. | "Feb 1, 2025: 779 Visits, 1,018 28-day average, graphic", "Mar 1, 2025: 1,023 Visits, 1,094 28-day average, graphic", then "Feb 1, 2025: …" again. The crosshair moves a month at a time. | |
| 18 | End, Page Down, then Page Up. | "Dec 31, 2025: 955 Visits, 848 28-day average, graphic", nothing new for Page Down, then "Nov 30, 2025: 647 Visits, 812 28-day average, graphic": a month back from the 31st is the last day of November. | |
| 19 | Escape, browse mode. Shift+Tab until "10, toggle button, not pressed" (6 times), press Space, and wait a few seconds while the chart is drawn again. Then Tab 6 times, focus mode, and Page Down twice. | "Daily visits, 2016 to 2025, grouping", "Jan 1, 2016: 959 Visits, 934 28-day average, graphic". Then "Feb 1, 2016: 1,082 Visits, 1,021 28-day average, graphic", "Mar 1, 2016: 1,278 Visits, 1,099 28-day average, graphic". | |
| 20 | Page Down 10 more times. | A month each, "Apr 1, 2016" to "Dec 1, 2016", then "Jan 1, 2017: 625 Visits, 846 28-day average, graphic". The ten years are 120 presses. | |

**The season page.** Open `season.html` and reload, so the page is after matchweek 24.

| # | Do | Expect to hear (roughly) | What you heard |
| --- | --- | --- | --- |
| 21 | Press Tab 4 times, to "Play next matchweek", and press Space. | "Play next matchweek, button", then "Matchweek 25: Okafor +1, 15 goals; Lindqvist +1, 7 goals." "+1" rises past Okafor's and Lindqvist's bars. | |
| 22 | Press Space again. | "Matchweek 26: Lindqvist +1, 8 goals." Okafor's "+1" goes: only this matchweek's changes are drawn. | |
| 23 | Section H's steps 8 to 11: Tab 9 times to the players' "Data table", Space, T, and along and down the rows. | As section H says: "Goals by player, table with 9 rows and 5 columns", Okafor's row "Forward", "15", "Change, column 4, 0", "Since matchweek 1, column 5, +14", then Lindqvist's "+8" and "Change, column 4, +1". | |

If a missing week is read with a number, or a step lands somewhere other than it says, say so: the names, or a page's size, may need to change.

## Re-check: each bar's description

Each bar of the library's chart has a description: the player's position, added after section A had passed. The roles, names, table and announcements are unchanged, so only these need hearing again:

| Screen reader | Do | Expect to hear (roughly) | What you heard |
| --- | --- | --- | --- |
| NVDA + Chrome | Section A, steps 1 and 3. | After each bar's name and "graphic", its position, perhaps after a pause: "Okafor: 16 goals, graphic, Forward"; "Castillo: 1 goal, graphic, Midfielder". **Not** the name or numbers a second time. | Passed (22 October 2026): each bar's position was read after its name, and nothing was read twice. |
| VoiceOver + Safari | Section B, steps 1 and 2. | After each bar's name and "image", its position, perhaps after a pause (VoiceOver may read descriptions only after a delay, or with VO+Shift+H). **Not** the name or numbers a second time. | |

If a description isn't read at all, that's acceptable: the position is also in the data table. If the name or numbers are read twice, the description isn't working as intended.

## Results

**NVDA + Chrome on Windows 11, 21 October 2026: passed.** Steps 1–13 read as expected, with the default settings, so every "Listen for" item passed. The roles (`group` on the `<svg>`, `img` on each bar), the table and the announcements stay as built. Versions weren't noted.
- That run heard "Castillo: 1 goals" in step 3, a known issue then. The demo now words its bars' names with `markLabel`, so the steps above say "1 goal". Only the wording changed, not the roles or the structure. **The new wording was heard as "Castillo: 1 goal" with NVDA + Chrome and with VoiceOver + Safari (October 2026).**
- The one hitch was the tester's, not the page's. In step 11, T did nothing because NVDA was still in focus mode; after NVDA+Space back to browse mode, it found the table. Step 11 now says so.

**The bars' descriptions, NVDA + Chrome on Windows, 22 October 2026: passed.** In [the re-check](#re-check-each-bars-description) (section A, steps 1 and 3), each bar's position was read after its name, and neither the name nor the numbers were read twice. So `markDescription` works as intended, and the descriptions stay as built. Versions weren't noted. VoiceOver + Safari hasn't been run on the descriptions.

**VoiceOver + Safari:** the full script hasn't been run yet. It was used to hear the "1 goal" wording above. **Not run for 0.1**: every section with VoiceOver + Safari is in the development log's backlog.

**The second chart (section C), NVDA + Chrome on Windows, 24 October 2026: passed.** The tester reported that everything sounded as expected, so every "Listen for" item passed: each player was read once, as one item, with every value the bar shows; the chart's name was heard once on the way in; a value of 1 read "1 goal" or "1 assist"; and nothing was read that can't be seen. `expressive()`'s names and roles stay as built. Versions weren't noted. VoiceOver + Safari hasn't been run on this chart.

**The donut page (section D), NVDA + Chrome on Windows, 22 October 2026: passed.** All 13 steps read as expected, so every "Listen for" item passed: each slice was read once as one item with its share, the donut's name and total were heard on the way in, the arrow keys went clockwise from 12 o'clock and stopped at the ends, the table's Share column and total row were read with their headers, each match was announced once, and the D3 pie read like the donut with its labels silent. The names and roles stay as built. Versions weren't noted. VoiceOver + Safari hasn't been run on this page.

**The Vega-Lite line on the line page (section E, steps 13 and 14), NVDA + Chrome on Windows, 24 October 2026: passed.** The tester reported that both steps sounded as expected. Before they were run, the audit found and fixed what step 13 listens for: Vega's unnamed `graphics-symbol` around each line, which axe flagged, and its `graphics-object`s, which Chrome named from the lines' names. With the fix, the Vega-Lite line reads as the D3 line does, and it stays as built. Versions weren't noted.

**The line page (section E), NVDA + Chrome on Windows, 22 October 2026: passed.** All 12 steps read as expected, so every "Listen for" item passed:
- each matchweek was read once, as one item, with both values and then its gap;
- the chart's name was heard on the way in;
- the arrow keys went a week at a time, stopped at the ends, and stopped at the last week shown when the scrubber was at week 5;
- the scrubber was read as "Through matchweek …", and nothing was read while the season played;
- the table's Difference column was read with its header, and its rows by their matchweek;
- the D3 line's two lines were each read once, by name.

The names, descriptions and roles stay as built. Versions weren't noted. VoiceOver + Safari hasn't been run on this page.

**The morph page (section F), NVDA + Chrome on Windows, 23 October 2026: passed.** The tester reported that all 13 steps sounded as expected, so every "Listen for" item passed:
- each slice and column was read once, as one item;
- the button was read by the view it goes to, "Show as columns" and then "Show as donut";
- each switch announced the new view's name once it landed;
- after V, focus was read on the same outcome in the other view, both ways;
- only the view shown was read, and T found one table;
- nothing was read that can't be seen, apart from the table's caption and the announcement.

The switch's names, roles, announcement and V key stay as built. The Speech Viewer text and the versions weren't recorded. VoiceOver + Safari hasn't been run on this page.

**The stress page's date line (section G), NVDA + Chrome on Windows, 24 October 2026: passed.** The tester reported that everything sounded as expected, so every "Listen for" item passed:
- each day was read once, as one item, with its date and both values;
- the chart's name was heard once on the way in;
- the arrow keys went a day at a time and stopped at the ends;
- nothing was read while the year played, and the readout was read once when it ended;
- the table's rows were named by their dates, and each cell was read with its column's header;
- nothing was read that can't be seen.

The date axis's names, the keyboard and the table stay as built. Versions weren't noted. VoiceOver + Safari hasn't been run on this page.

**The season page (section H), NVDA + Chrome on Windows, 26 October 2026: passed.** The tester reported that script H passed, so every "Listen for" item passed:
- a focused week was read once, from the chart with focus, and nothing was announced as it moved, though the other two charts showed it;
- focus stayed in the chart it was in;
- each matchweek was announced once, with each player who scored, their change and their total;
- the players' table read its Change and Since matchweek 1 columns with their headers;
- each slope line was read once, with both ends and its change;
- nothing was read that can't be seen, and the changes drawn past the bars and names weren't read on their own.

So linked hover is visual only, and the page's announcement, table and names say what `delta()` and `label()` draw. They stay as built. Versions weren't noted. VoiceOver + Safari hasn't been run on this page.

**Missing values, Page Up and Page Down, and the season page again (section I), NVDA + Chrome on Windows, 27 October 2026: passed.** The tester reported that every step sounded as expected, so every "Listen for" item passed:
- a missing week was read once, as one item, saying what's missing, never as a 0 or with a gap;
- the arrow keys, and Page Up and Page Down, stopped at the missing weeks as at any other;
- the table read "missing" with its column's header;
- each D3 line was read once, by name, with the weeks it's missing;
- Page Up and Page Down went a tenth of the weeks or bars, or a month on the date line, and stopped at the ends;
- the season page's announcements and table read as in section H, without the page's workarounds.

So the line chart's words for a missing value, the D3 lines' names, the keys and the season page stay as built. It was run with the focus line at a week with no values in place ([#91](https://github.com/Deaversbp/expressive-charts/pull/91)), which step 3 looks for. Versions weren't noted. VoiceOver + Safari hasn't been run on these pages.

Template for the next run:

- Screen readers and versions (e.g. NVDA 2025.3, Chrome 141; macOS 26, Safari 26):
- Any settings changed from the defaults (verbosity, punctuation, table reading):
- Did each "Listen for" item pass?
  1. Each bar read once, as one item:
  2. The chart's name read on the way in:
  3. Announcements read:
  4. Table headers read:
  5. Nothing read that you can't see:
- Anything else odd, or that you'd change (wording, too much or too little said):

## If something reads badly

These are the changes on the table, depending on what you hear:

- **A bar read in pieces, or twice.** Hide more of the bar's children, or move its name onto the focusable element in another way.
- **"graphic"/"image" is confusing, or you'd like a count ("3 of 8").** Use `role="list"` and `role="listitem"`. This gives a count, but NVDA and JAWS often read a list item's text instead of its `aria-label`, so the values would need to be visible text.
- **The chart isn't named on the way in, or "grouping" says too little.** Add `aria-roledescription="bar chart"` to the group. Screen readers would then say "bar chart" instead of "group", and the chart would need a way to translate it.
- **Announcements not read, or read late.** Change when the region is written: once the update settles, instead of when it starts. Or make it `role="log"`.
- **The graphics roles** (`graphics-document`, `graphics-symbol`) were left out on purpose. Browsers map `graphics-symbol` to an image, but screen readers announce `graphics-document` inconsistently, and where a role isn't supported it falls back to nothing. `group` and `img` are core ARIA, so every screen reader knows them.
