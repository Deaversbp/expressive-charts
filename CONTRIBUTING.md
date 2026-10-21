# Contributing

Thanks for helping. Read [docs/architecture.md](docs/architecture.md) first; the rules below assume it.

## Setup

```sh
npm install
npm run dev        # demo pages with live reload
npm test           # tests
npm run typecheck  # types
npm run build      # package output in dist/
```

Node.js 22 or newer is required (CI tests 22 and 24).

## Visual tests

`tests/visual/` takes screenshots of `demo/bars.html` in Chromium with [Playwright](https://playwright.dev): light and dark, the ball-and-cleat story mid-travel and at rest, each motion mode, keyboard focus, the tooltip and legend, a staged metric switch, and reduced motion. Time is stopped with Playwright's fake clock, and a test moves it with `page.clock.runFor(ms)`, so every screenshot shows the same frame (see `tests/visual/demo.ts`).

Fonts render differently on each OS, so the baselines come from Linux, in the official Playwright Docker image that CI runs in. Run them through Docker:

```sh
npm run test:visual:docker                   # compare against the baselines
npm run test:visual:update                   # write new baselines after a visual change
npm run test:visual:docker -- --grep focus   # other options go to playwright test
```

After `test:visual:update`, look at the changed images in `tests/visual/__screenshots__/` before committing them. Failures leave the actual picture and a diff in `test-results/`.

Without Docker, run **Update visual baselines** from the repository's Actions tab on your branch: it writes the changed screenshots in the same image and uploads them as the `visual-baselines` artifact, to unzip over `tests/visual/__screenshots__/` and commit.

`npm run test:visual` runs Playwright directly. On Windows and macOS it skips the screenshot comparisons and runs only the DOM checks; it needs Chromium once (`npx playwright install chromium`).

The Docker image's tag follows `@playwright/test` in `package.json`. When you upgrade Playwright, pin the exact version, change the image tag in `.github/workflows/ci.yml` and `visual-baselines.yml` to match, and regenerate the baselines.

## Adding an effect

1. Create `src/effects/<name>.ts` that implements `GeometryEffect` or, if it reads values, `DataEffect` (`src/core/contracts/effect.ts`).
2. Read only from `MarkGeometry` (and the datum, for data effects). Do not check chart types.
3. Express durations as base values and pass them through the motion core.
4. Implement `end()` so reduced motion shows a sensible final state.
5. Add `src/effects/<name>.test.ts`, and add the effect to `src/effects/conformance.test.ts` and `src/conformance.test.ts`, which run `checkEffect` (`expressive-charts/testing`) on every kind of mark and on real marks from every chart and adapter. [docs/effects-guide.md](docs/effects-guide.md) has the rules and a review checklist.
6. Add a demo to `demo/`.

## Adding a chart

1. Create `src/charts/<name>.ts`.
2. Give every mark a stable key and describe it with `MarkGeometry`, including `path` and `angle`.
3. Emit the standard events (`enter`, `update`, `exit`, `hover`, `leave`).
4. Make every existing effect work on it. If one doesn't, extend `MarkGeometry` rather than special-casing the effect.

## Pull requests

- Keep each pull request focused on one change.
- Run `npm run typecheck && npm test && npm run build` before opening it. CI runs the same checks.
- If the change affects how the demo looks or moves, run `npm run test:visual:docker` too, and commit updated baselines if the change is intended. CI runs the visual suite as a separate job.
- Update `README.md` and `docs/architecture.md` when the public API changes.
