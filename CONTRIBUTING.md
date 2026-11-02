# Contributing

Thanks for helping. Read [docs/architecture.md](docs/architecture.md) first; the rules below assume it.

## Setup

```sh
npm install
npm run dev        # demo pages with live reload
npm test           # tests
npm run typecheck  # types, with TypeScript 7
npm run build      # package output in dist/
npm run size       # bundle sizes against their budgets, after a build
npm run pack-check # after a build: the packed tarball, installed and used as a consumer would
```

Vitest gives each test 15 s (`vitest.config.ts`), not its default 5: a few heavy tests take several seconds when other suites run on the same machine, or on CI's slower runner, though each takes about 1 s alone. A test that times itself keeps its own limit.

Three TypeScripts are dev dependencies, each pinned exactly:

- `typescript` (7.0.2), the native compiler, runs `typecheck`.
- `typescript-6` (`npm:typescript@6.0.3`) runs `src/api-docs.test.ts`, which reads the entries with TypeScript's JS API, which 7.0 doesn't have.
- `typescript-5.4` (`npm:typescript@5.4.5`), the oldest README promises, is for `pack-check`.

Each has a `tsc`, so `npx tsc` could run any of them: run TypeScript through the npm scripts, or by its path (`node node_modules/typescript/bin/tsc`).

The build uses none of them. tsdown (`tsdown.config.ts`), 0.23.4 pinned exactly, bundles the package with Rolldown, whose oxc writes the declarations from each file alone, so **a new export needs an explicit type** wherever TypeScript would have to look at another file to infer it. `typecheck` says so (`isolatedDeclarations` in `tsconfig.json`): `export const describe = { bar: describeBar }` fails, and `export const describe: { bar: typeof describeBar } = { bar: describeBar }` passes. An exported function needs its return type.

tsdown 0.23.4 takes rolldown-plugin-dts 0.28.8. The plugin's 0.29.0 waits for a tsdown that asks for it. Both pin `get-tsconfig` 5.0.0-beta.6, a beta, so the build waits for a stable release of it too.

One Rolldown, 1.2.16, builds the package and bundles the size check's import sets: tsdown asks for `~1.2.15`, and Vite 8.3.5, which the size check and the demo site use, for `~1.2.14`, so the lockfile keeps a single copy. A new Rolldown can change the build and the sizes at once, so compare its build with main's before taking it: the files byte for byte, and where any differ, each entry's names as an ES module and as CommonJS, its types and the sizes.

`pack-check` (`scripts/pack-check.mjs`) packs the package, installs the tarball in a new project in the system's temporary folder, imports every entry in Node as ES modules and as CommonJS with no DOM, and typechecks a small consumer against it with each of the three TypeScripts, under `bundler`, `node16` (ES module) and `node16` (CommonJS) resolution. Each must read its own declarations: `.d.ts` for `import`, `.d.cts` for `require`, the stylesheet's included. CI runs it after the build. `-- --keep` keeps the temporary project.

Working on the library needs Node.js 22.18 or newer, or 24.11 or newer on 24, as tsdown asks (CI tests 22 and 24). The package itself needs Node.js 22 or newer. The unit tests run in jsdom 29: jsdom 30 needs Node.js 22.22.2 or newer on 22, or 24.15 or newer on 24, so it waits until working on the library asks for that.

## Visual tests

`tests/visual/` takes screenshots of the demo pages in Chromium with [Playwright](https://playwright.dev), with DOM checks beside them. Firefox and WebKit run every DOM check too, without the screenshots, so a test that takes a picture should check what it can in the DOM as well:

- `demo/bars.html` (`bars.spec.ts`, `reduced-motion.spec.ts`): light and dark, both charts part way through drawing their bars in as the page loads and at rest, the ball-and-cleat story mid-travel and at rest, each motion mode, keyboard focus, the tooltip and legend, a staged metric switch, and reduced motion. The draw-in's DOM checks cover each bar faint with its stroke in its segment's colour, nothing announced, focus on a bar part way, and reduced motion and Off. To catch it part way, `openLoading` loads the page again once `openDemo` has stopped the clock, so the draw-in starts at the same time on every run.
- `demo/donut.html` (`donut.spec.ts`): light and dark, the ball rolling round a slice and at rest on the library's donut and on the D3 pie, a wiggle at its peak and a pulse half-way, the focus ring on both donuts in both themes, and the tooltip. The DOM checks cover reduced motion, the effect picker (each chart's effect swapped in place, with the D3 pie's tab stop kept), "Next match", and the D3 pie's slices, read from its paths, going clockwise with Largest first.
- `demo/line.html` (`line.spec.ts`): light and dark at rest, both charts mid-play at week 20, the crosshair with its tooltip, the focus ring on the line chart and on the D3 line in both themes, the D3 line hovered, the Vega-Lite line at rest, focused (both themes) and hovered, the first chart curved and the Vega-Lite line with it, a point hovered and focused (both themes) with Nearest point, and the charts with missing weeks mid-play in a gap, with the crosshair at a missing week, and with keyboard focus there in both themes. The DOM checks cover how long Play takes in Presentation and Analysis, Pause, the scrubber, the names, legend and table, the Vega-Lite line following a resize, and reduced motion, where Play ends at once; the toggles (each in a named group, focus kept on a pick, and the chart's tab stop kept); Curved (through every week's value and never past the values either side, easing in, the red and the ball following, back to the straight lines exactly, and at once with reduced motion and Off); Nearest point (the other line, its points and its decorations dimmed and no text, the tooltip's one value, the pointer onto it, from every point at 1,000 and 320 px, the keys along and between the lines, the tooltip clear of the ring at every point, and its end at once with reduced motion and Off); and on the charts with missing weeks, no red in a gap, the ball waiting at a gap and jumping it, the names, keys and table at a missing week, the focus there (a 2 px line at 3:1 that stays after Escape), a gap staying a gap with reduced motion and Off, curved runs between the gaps, and with Nearest point the keys passing over a missing week.
- `demo/morph.html` (`morph.spec.ts`): the donut and the columns in light and dark, a switch half way with each mapping (`"drop"` and `"unroll"`), and the focus ring after a switch. The DOM checks cover how long a switch takes in Presentation, Analysis and Off, reduced motion, a switch back mid-way reversing, the labels swapping their text, focus following its key, the announcement, the mapping control, only the view shown being in Chrome's accessibility tree (in Chromium only, since it's read over CDP), and the bars linked with the switch, both ways, across a switch and after the mapping is picked again. The season's switch below: Season to date and Columns, half way from a line to its columns and between the two lines, and a column focused after V. Its DOM checks cover the toggles keeping focus, each view announced, V with focus following the week, Tab after a pick landing on the same week or its column, nothing drawn in the weeks both lines miss on any frame of a switch and both end dots on every frame, reduced motion and Off, and what its views let a screen reader reach.
- `demo/season.html` (`season.spec.ts`): light and dark at rest, a linked hover from the line, the players' bars and both lines' changes after a matchweek, the line chart at matchweek 35 at 1,000 and 320 px, its changes in the room above its plot, and the slope chart mid-trace. The DOM checks cover what a linked chart shows and doesn't (no tooltip, crosshair, ring or focus), Emphasis only, the keyboard and Escape across the link, each matchweek's changes in the overlay, clear of every text, both lines' too, clear of each other, the legend and the heading, and inside the line chart, at every matchweek at 1,000, 480 and 320 px, the table and the announcement, with the season to date, a matchweek played mid-change, reduced motion and Off, and the changes' room at 320 px.
- `demo/shapes.html` (`shapes.spec.ts`): light and dark at rest, a pulse half-way round a mark of each chart (the D3 scatter, Plot's dots, the D3 curved line and the D3 area), and the focus ring on each. The DOM checks cover each chart's circles or paths read by tag and named, the arrow keys in document order, the curve's red and the ball at its tip, every text keeping its strength while a mark is hovered, the hover effect picker swapping every chart's effect in place with focus and the tab stops kept, a held hover replaying with each new effect, and reduced motion and Off.
- Every page (`a11y.spec.ts`, no screenshots): `axe-core`'s WCAG 2.2 A and AA rules in light and dark, at 320 px and under forced colours, on `morph.html` mid-switch and with the season switch's other views shown, and on `line.html` with Curved and Nearest point picked; the tab order with a visible focus at every stop; on the pages with the library's charts, the tooltip clear of the focus ring, and dismissed by Escape (attachments draw none); text spacing; nothing moving by itself after 5 s; and legends and pressed toggles under forced colours. Only Chromium applies forced colours when they're emulated, so those checks run there. [docs/a11y-audit.md](docs/a11y-audit.md) has what they found.

Time is stopped with Playwright's fake clock, and a test moves it with `page.clock.runFor(ms)`, so every screenshot shows the same frame. `openDemo(page, demo)` in `tests/visual/demo.ts` opens a page with the clock stopped and waits for its charts. Screenshot names are shared across spec files, so a new page's names start with the page's name (`donut-…`). The page must fit the 1000 × 2000 viewport, or `openDemo` throws: a test that scrolled would move the page under a resting pointer. A page that's taller gives the height it needs as its `Demo`'s `height` (the line page's is 3,100, the morph page's 3,000, and the shapes and season pages' 2,200), and `openDemo` grows the viewport to it; the config's stays, since a shorter page's full-page picture is the viewport's height.

Fonts render differently on each OS, so the baselines come from Linux, in the official Playwright Docker image that CI runs in. Run them through Docker:

```sh
npm run test:visual:docker                   # compare against the baselines
npm run test:visual:update                   # write new baselines after a visual change
npm run test:visual:docker -- --grep focus   # other options go to playwright test
```

After `test:visual:update`, look at the changed images in `tests/visual/__screenshots__/` before committing them. Failures leave the actual picture and a diff in `test-results/`.

Without Docker, run **Update visual baselines** from the repository's Actions tab on your branch: it writes the changed screenshots in the same image and uploads them as the `visual-baselines` artifact, to unzip over `tests/visual/__screenshots__/` and commit.

`npm run test:visual` runs Playwright directly. On Windows and macOS it skips the screenshot comparisons and runs only the DOM checks; it needs the browsers once (`npx playwright install chromium firefox webkit`), or `-- --project=chromium` for Chromium alone. `test:visual:update` writes Chromium's baselines only, since they're the only ones.

The DOM checks that measure text follow the fonts too, and Docker's run is the one that counts.

The Docker image's tag follows `@playwright/test` in `package.json`. When you upgrade Playwright, pin the exact version, change the image tag in `.github/workflows/ci.yml` and `visual-baselines.yml` to match, and regenerate the baselines.

## README's pictures and the demo site

README's four pictures are GIFs in `docs/media/`, captured from the demo pages by `scripts/media/capture.ts`. The arrow comes from `scripts/media/quick-start.html`, which is README's first example. Remake them after a change that shows in them:

```sh
npm run media   # in Playwright's Docker image, like the visual tests
```

The capture runs on the fake clock, so a run draws the same frames each time, and writes each GIF with its own small encoder (`scripts/media/gif.ts`), so there's nothing to install. Each GIF plays once, has no loop, and stops on the effect's end state within 5 seconds (WCAG 2.2.2): npm can't pause a picture, and GitHub only does for a viewer who asks for reduced motion. `src/api-docs.test.ts` checks this, and keeps each under 1 MB. README links them by absolute URL on `raw.githubusercontent.com`, since npm shows README away from the repository. Look at a new GIF before committing it, since a test can't tell whether the right moment is in the picture.

`.github/workflows/pages.yml` builds every page in `demo/` with Vite (`npm run build:site`, configured in `demo/vite.config.mjs`) on each pull request, and publishes it from `main` at <https://deaversbp.github.io/expressive-charts/>, once the repository's Pages source is GitHub Actions. To check the built site locally, run `npm run build:site`, then `npx vite preview demo --port 4173`: the visual suite (`npm run test:visual`) reuses a server on that port, so its DOM checks run against the built pages.

## Bundle size

`npm run size` measures the build (run `npm run build` first) and fails when a size is over its budget in `scripts/size-budget.json`. CI runs it on Node 24 and puts its tables in the job's summary. It measures:

- each published JS file and the stylesheet, raw, gzip and brotli. An ES module entry counts the chunks it imports;
- import sets: what a page that imports a few names pays, bundled from `dist/index.js` with Vite and minified. When a small set grows and you didn't change what it imports, something has broken tree-shaking, such as code that runs on import. A value built at a module's top level, with a call, a template with values in it or a spread, stays in every page that imports `dist/index.js`, so build it in a call marked `/* @__PURE__ */`, as `src/charts/render/theme.ts` does.

Budgets are gzip sizes in KB (1,024 bytes). [architecture.md](docs/architecture.md#bundle-size) has today's sizes.

When the check fails:

1. Find out what grew. The table shows every size; compare it with the one in the summary of main's last CI run.
2. If the growth isn't meant (tree-shaking broken, or a module pulled in that the page doesn't use), fix it.
3. If it's meant, because a feature costs what it costs, raise that budget in the same PR: to the new size plus about 10%, rounded up to 0.5 KB. The failure message gives that number. Say in the PR which budget you raised, by how much, and why.

Raise a budget only when it fails, so the room left in the others still catches surprises. After a change that makes something much smaller, you can lower its budget the same way, so the room isn't spent by accident.

A new import set goes in `importSets` in `scripts/size.mjs`, with its budget in `scripts/size-budget.json` under the same name. The check fails when something it measures has no budget, or a budget names something it doesn't measure.

## Adding an effect

1. Create `src/effects/<name>.ts` that implements `GeometryEffect` or, if it reads values, `DataEffect` (`src/core/contracts/effect.ts`).
2. Read only from `MarkGeometry` (and the datum, for data effects). Do not check chart types.
3. Express durations as base values and pass them through the motion core.
4. Implement `end()` so reduced motion shows a sensible final state.
5. Add `src/effects/<name>.test.ts`, and add the effect to `src/effects/conformance.test.ts` and `src/conformance.test.ts`, which run `checkEffect` (`expressive-charts/testing`) on every kind of mark and on real marks from every chart and adapter. [docs/effects-guide.md](docs/effects-guide.md) has the rules and a review checklist.
6. Add a demo to `demo/`.

## Adding a chart

1. Create `src/charts/<name>.ts`.
2. Give every mark a stable key and describe it as a `MarkGeometry`, with the `describe` builders (`describe.bar`, `.arc`, `.line` or `.point`) where one fits.
3. Emit the standard events (`enter`, `update`, `exit`, `hover`, `leave`).
4. Make every existing effect work on it. If one doesn't, extend `MarkGeometry` rather than special-casing the effect.

## Pull requests

- Keep each pull request focused on one change.
- Run `npm run typecheck && npm test && npm run build` before opening it, and `npm run size` after the build. CI runs the same checks, then `npm run pack-check`.
- If the change affects how the demo looks or moves, run `npm run test:visual:docker` too, and commit updated baselines if the change is intended. CI runs the visual suite as a separate job.
- Update `README.md` and `docs/architecture.md` when the public API changes, and `docs/api.md`, the reference: `src/api-docs.test.ts` fails when an export has no entry there or an entry names no export, and type-checks every example in README and every example in `docs/api.md` that imports the package. An example uses the page's own names (`players`, `bars`), which the test declares in `PAGE`. README's links must be absolute (`https://github.com/Deaversbp/expressive-charts/blob/main/…`), since npm shows it away from the repository.
- A name in the 0.x promise (in `CHANGELOG.md`) changes only in a minor release, with a migration note, and a deprecated name keeps working for one minor release. `src/promise.test.ts` names every promised value and type, so renaming or removing one fails `typecheck`; a name added to the promise goes in both lists, and a test checks they match.

## Releasing

Releases go to npm from CI: `.github/workflows/release.yml` publishes when a GitHub release is published, and at no other time. Don't publish from a terminal. The workflow publishes with npm's provenance statement (`publishConfig` in `package.json` asks for it), which needs GitHub's OIDC token and a public repository: npm refuses a publish with provenance from a private one.

1. **In a pull request,** set the version in `package.json`, the lockfile's root and `VERSION` in `src/index.ts` (a test checks `package.json` and `VERSION` match), and move CHANGELOG's Unreleased entries under the new version and its date.
2. **After it merges,** create a GitHub release from `main` whose tag is `v` and the version (`v0.2.0`), and publish it.
3. **The workflow** checks that the tag matches `package.json` and that npm is 11.5.1 or newer, runs `typecheck`, `test`, `build`, the size check and `pack-check`, then `npm publish --provenance --access public` on Node 24. If the tag doesn't match, nothing is published: fix the release's tag, or the version in a new pull request.

**Authentication.** From 0.2.0, releases use trusted publishing: npm trades the job's OIDC token from GitHub (through `id-token: write`) for a short-lived one that can publish this package from `release.yml` and nowhere else. The repository has no npm token.

- **The trusted publisher,** in the package's settings on npmjs.com: GitHub Actions, user `Deaversbp`, repository `expressive-charts`, workflow `release.yml`, no environment, with direct `npm publish` among its allowed actions (a configuration made since 3 September 2026 allows only `npm stage publish` unless it's ticked). npm doesn't check the fields when they're saved; a mistake shows at the publish, as `ENEEDAUTH`. A new configuration expires unless a publish uses it within 2 days, so if it's ever made again, add it just before the release that will use it. npm saves one only for an account with two-factor authentication.
- **If the publish stops with `ENEEDAUTH`,** nothing was published: npm found no trusted publisher that matches the run. That's what happens when the connection is saved after the release's run has started, as it was for 0.2.0. Check the connection on npmjs.com, then run the failed job again (**Re-run failed jobs** on the run's page, or `gh run rerun <run id> --failed`). It publishes from the same release and tag, so there's nothing to create again.
- **The package's publishing access** requires two-factor authentication and disallows tokens, set after 0.2.0, the first publish through the trusted publisher. That doesn't affect trusted publishing.
- **The workflow needs no change.** npm tries trusted publishing before a token, and with no `NPM_TOKEN` secret the publish step's `NODE_AUTH_TOKEN` is empty, which npm ignores. If trusted publishing doesn't allow the publish, it stops with `ENEEDAUTH` and publishes nothing. Trusted publishing needs npm 11.5.1 or newer (the workflow checks) and Node 22.14 or newer, and it makes the provenance statement itself.
- **0.1.0 was published with a token** (24 October 2026), since npm only sets up trusted publishing for a package that exists. It was a granular access token with **Read and write (publish and stage)**, **All packages** and **Bypass two-factor authentication**, for 7 days, in the repository secret `NPM_TOKEN`. The token and the secret were deleted after it. npm is ending direct publishing with a token that bypasses 2FA in January 2027, so don't plan on a token again.
- **If direct publishing isn't allowed,** stage instead: change the workflow's last step to `npm stage publish --provenance --access public` (staging needs npm 11.15 or newer, so raise the workflow's npm check to match), and after it runs, approve the version with 2FA in the **Staged Packages** tab on npmjs.com, or with `npm stage approve <stage-id>` (npm 11.15 or newer). Until it's approved, nobody can install it.
