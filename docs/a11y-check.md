# Screen-reader check: `barChart` (M2 step 5)

This check settles the ARIA roles of the reference bar chart (plan §7.2). It also checks the data table and the live region. Run it with one or both of NVDA + Chrome and VoiceOver + Safari. Then send back what you heard, and the roles and labels get adjusted to match.

**Result (October 2026): passed with NVDA + Chrome.** All 13 steps read as expected, so the roles stay as built. VoiceOver + Safari hasn't been run yet; see [Results](#results).

A screen reader reads the page aloud, so "hear" means real speech. You don't need the sound on, though: NVDA's Speech Viewer shows everything it says as text, and that text is the easiest thing to send back.

## What's being tested

- **The chart.** The `<svg>` is `role="group"`, named by the chart's `label`. Each bar is `role="img"`, named by its `aria-label` ("Okafor: 16 goals, 4 assists"). Bars are focusable with a roving tabindex, so the chart is one tab stop and the arrow keys move between bars. Inside a bar, the text and shapes are hidden, so its name is the only thing read. A tooltip function's text becomes the bar's description; the demo uses the default tooltip, so it has no descriptions.
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
- **The second chart** ("The same story on someone else's chart") is the page's own SVG, with effects added by `expressive()`. Its ARIA isn't part of this step, so skip it. (Its `<svg>` is `role="img"` with focusable bars inside, which screen readers handle badly. That's a separate follow-up.)

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
| 12 | Ctrl+Alt+Down, then Ctrl+Alt+Right 4 times. | "row 2, Adeyemi". Then "Position, column 2, Midfielder", "goals, column 3, 4", "assists, column 4, 6", "Total, column 5, 10". | |
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
| 11 | VO+Down, then VO+Right 4 times. | "Adeyemi, row 2". Then each cell with its column header: "Midfielder, Position", "4, goals", "6, assists", "10, Total". | |
| 12 | VO+Down. | "6, Castillo", or the row header and value in some order. | |

## Results

**NVDA + Chrome on Windows 11, 21 October 2026: passed.** Steps 1–13 read as expected, with the default settings, so every "Listen for" item passed. The roles (`group` on the `<svg>`, `img` on each bar), the table and the announcements stay as built. Versions weren't noted.
- That run heard "Castillo: 1 goals" in step 3, a known issue then. The demo now words its bars' names with `markLabel`, so the steps above say "1 goal". Only the wording changed, not the roles or the structure.
- The one hitch was the tester's, not the page's. In step 11, T did nothing because NVDA was still in focus mode; after NVDA+Space back to browse mode, it found the table. Step 11 now says so.

**VoiceOver + Safari:** not run yet. It needs a Mac.

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
