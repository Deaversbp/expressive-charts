// Effect slots: where charts and adapters attach effects, under their `on` option.

import type { MarkEffect } from "./effect";

/** The events effects attach to. */
export type EffectSlot = "hover" | "enter" | "update" | "exit" | "decorate";

/**
 * A registered preset's name. The built-in names autocomplete; custom names (registerPreset) are
 * allowed too, so a misspelled name isn't a type error: the chart throws when it's created.
 */
export type PresetName = "wiggle" | "pulse" | "flash" | (string & {});

export type EffectOption<D> = MarkEffect<D> | PresetName;

/**
 * The `on` option of charts and adapters. Use it as `EffectSlots<NoInfer<D>>`, so a generic data
 * effect such as threshold() can't widen the chart's row type to unknown.
 */
export interface EffectSlots<D> {
  /** On pointer hover or keyboard focus; cleared on leave, replayed after a data transition. */
  readonly hover?: EffectOption<D>;
  /** When a mark appears. */
  readonly enter?: EffectOption<D>;
  /** When a mark's values change (not on a re-sort alone). */
  readonly update?: EffectOption<D>;
  /** Before a mark is removed; removal waits for it. */
  readonly exit?: EffectOption<D>;
  /** From enter until exit, following every geometry change. */
  readonly decorate?: EffectOption<D>;
}
