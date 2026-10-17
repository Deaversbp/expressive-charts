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

Node.js 20 or newer is required.

## Adding an effect

1. Create `src/effects/<name>.ts` that implements the `Effect` interface.
2. Read only from `MarkGeometry` (and the datum, for data effects). Do not check chart types.
3. Express durations as base values and pass them through the motion core.
4. Implement `end()` so reduced motion shows a sensible final state.
5. Add `src/effects/<name>.test.ts` and check the effect against every built-in chart.
6. Add a demo to `demo/`.

## Adding a chart

1. Create `src/charts/<name>.ts`.
2. Give every mark a stable key and describe it with `MarkGeometry`, including `path` and `angle`.
3. Emit the standard events (`enter`, `update`, `exit`, `hover`, `leave`).
4. Make every existing effect work on it. If one doesn't, extend `MarkGeometry` rather than special-casing the effect.

## Pull requests

- Keep each pull request focused on one change.
- Run `npm run typecheck && npm test && npm run build` before opening it. CI runs the same checks.
- Update `README.md` and `docs/architecture.md` when the public API changes.
