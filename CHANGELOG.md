# Changelog

Nothing is published yet. Each release will be listed here, newest first. Until then, [docs/plan.md](docs/plan.md) records what each milestone built.

## The 0.x promise

The library follows [semantic versioning](https://semver.org) from 0.1.0, with this promise for the 0.x releases.

**The effect-author API** is:

- `defineEffect` and `defineDataEffect`, with `GeometryEffectSpec` and `DataEffectSpec`;
- `matrix` and `offset`;
- `describe.bar`, `describe.arc`, `describe.line` and `describe.point`;
- the effect contracts (`GeometryEffect`, `DataEffect`, `MarkEffect`, `AnyMarkEffect`, `Combined`), the context (`EffectContext`), the mark and its data (`MarkGeometry`, `Outline`, `MarkData`, `Sample`), and the drawing API (`Layer`, `MarkHandle`, `MarkStyle`, `Matrix`, `Paint`, `TextStyle`, the handles, `Color`);
- `expressive-charts/testing`: `checkEffect`, `fixtures`, `testContext` and `play`.

From 0.1.0:

- **A breaking change to that API comes only in a minor release** (0.1 → 0.2), never in a patch, and this file lists it with a migration note: what changed, and what to write instead.
- **A deprecated name keeps working for one minor release.** It's marked `@deprecated` with its replacement, and removed in the minor release after that.
- Additions (a new optional field, a new helper) can come in any release.

The rest of the API (charts, adapters, built-in effects, controls) can still change in a minor release while the library is 0.x; those changes are listed here too. [docs/effects-guide.md](docs/effects-guide.md) is the guide to the author API.

## Unreleased

### Added

- **The effect-author API is public** ([guide](docs/effects-guide.md)). `defineEffect(spec)` and `defineDataEffect<D>(spec)` make an effect from its `run` and `end`: they fill in the kind and a `clear()` that does nothing, throw a `TypeError` without `run` or `end` (every effect needs an end state), and freeze the effect. A data effect's spec is checked against its row type strictly.
- **`expressive-charts/testing`**, a separate entry with the conformance suite. `checkEffect(effect, { marks, icons, data, batch, moved, name })` runs five checks on every mark (a full run ends as `end()` draws; clearing leaves nothing; an abort settles; with motion off no frames run; after a run or `end()`, a `change()` to the mark moved somewhere else leaves what `end()` draws there) and throws one `Error` listing every failure, in any test runner. The fixtures have moved twins for the fifth check; a page's own marks pass `moved(mark)` or skip it. With it: `fixtures` (one of each kind of mark), `testContext` and `play`.
- **`threshold({ compareTo, when, color })`**, the first data effect. It colours the parts of a mark's walk where its values are below a constant or a related series (`when: "above"` for above), in `"negative"` by default, with crossings interpolated between samples. A series is matched by `at` where both have it, else by `t`, and goes in `needs.related`. It draws at once, with no animation, and redraws on every change, so it belongs in `on.decorate`.

### Changed

- `matrix` and `offset` are no longer experimental.
- `sequence` starts each part on the mark's geometry and data as they are when that part starts, not as they were when the sequence started, so a part after a travel follows a line that grew meanwhile.
- `onChange` listeners in the `update` slot get data that keeps the previous values the run was given, so `stagger` and `sequence` no longer drop them when they start an effect on the latest data.
