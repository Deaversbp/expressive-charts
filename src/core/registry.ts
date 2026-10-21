// Named things charts look up: presets (name → effect factory) and icons. The composition root
// (src/index.ts) owns the page-wide registries and hands them to charts, so a chart never knows
// what a name means.

import type { AnyMarkEffect, MarkEffect } from "./contracts/effect";
import type { EffectSlot, EffectSlots } from "./contracts/slots";
import type { SlotEffects } from "./runner";

export interface Registry<T> {
  /** The entry registered under `name`, if any. A Registry<Icon> is an IconSource. */
  get(name: string): T | undefined;
  /** Like get(), but an unknown name throws a RangeError that lists what is registered. */
  resolve(name: string): T;
  /** A later registration under the same name replaces the earlier one. */
  register(name: string, value: T): void;
  /** Registered names, in the order they were first registered. */
  names(): string[];
}

export interface RegistryOptions<T> {
  /** What the entries are, for error messages: "preset", "icon". */
  readonly kind: string;
  readonly entries?: Readonly<Record<string, T>>;
  /** Appended to the unknown-name error, for example how to register one. */
  readonly hint?: string;
}

export function createRegistry<T>(options: RegistryOptions<T>): Registry<T> {
  const { kind, hint } = options;
  const entries = new Map<string, T>();

  const registry: Registry<T> = {
    get: (name) => entries.get(name),
    resolve(name) {
      const value = entries.get(name);
      if (value !== undefined) return value;
      const known = entries.size > 0 ? [...entries.keys()].join(", ") : "none";
      throw new RangeError(`Unknown ${kind} "${String(name)}". Registered ${kind}s: ${known}.${hint ? ` ${hint}` : ""}`);
    },
    register(name, value) {
      if (typeof name !== "string" || name === "") throw new TypeError(`A ${kind} needs a non-empty string name, got ${JSON.stringify(name)}.`);
      if (value === undefined) throw new TypeError(`Registering ${kind} "${name}" needs a value.`);
      entries.set(name, value);
    },
    names: () => [...entries.keys()]
  };
  for (const [name, value] of Object.entries(options.entries ?? {})) registry.register(name, value);
  return registry;
}

/** Makes a fresh effect for a preset name. Presets work on any rows, so they return MarkEffect. */
export type PresetFactory = () => MarkEffect;

export const EFFECT_SLOTS: readonly EffectSlot[] = ["hover", "enter", "update", "exit", "decorate"];

/**
 * Turns a chart's `on` option into the effects its runner plays: preset names go through `presets`,
 * effects pass through. Charts call it when they're created, so an unknown preset name, a slot that
 * doesn't exist or a transition effect in a mark slot throws there instead of drawing nothing.
 */
export function resolveEffects<D>(on: EffectSlots<D> | undefined, presets: Pick<Registry<PresetFactory>, "resolve">): SlotEffects<D> {
  const effects: { [S in EffectSlot]?: MarkEffect<D> } = {};
  for (const slot of Object.keys(on ?? {})) {
    if (!(EFFECT_SLOTS as readonly string[]).includes(slot)) {
      throw new TypeError(`on.${slot} isn't an effect slot. Use one of: ${EFFECT_SLOTS.join(", ")}.`);
    }
  }
  for (const slot of EFFECT_SLOTS) {
    const option = on?.[slot];
    if (option === undefined) continue;
    if (typeof option === "string") {
      const effect: unknown = presets.resolve(option)();
      if (!isMarkEffect(effect)) throw new TypeError(`Preset "${option}" for on.${slot} didn't return a mark effect; it returned ${describeValue(effect)}.`);
      effects[slot] = effect;
    } else {
      if (!isMarkEffect(option)) throw new TypeError(`on.${slot} needs a mark effect (kind "geometry" or "data") or a preset name, got ${describeValue(option)}.`);
      effects[slot] = option;
    }
  }
  return effects;
}

/** True for a geometry or data effect with run, end and clear. Combinators check their parts with it too. */
export function isMarkEffect(value: unknown): value is AnyMarkEffect {
  if (typeof value !== "object" || value === null) return false;
  const effect = value as Partial<Record<"kind" | "run" | "end" | "clear", unknown>>;
  return (
    (effect.kind === "geometry" || effect.kind === "data") &&
    typeof effect.run === "function" &&
    typeof effect.end === "function" &&
    typeof effect.clear === "function"
  );
}

/** What a value that isn't a mark effect is, for error messages. */
export function describeValue(value: unknown): string {
  if (typeof value !== "object" || value === null) return value === null ? "null" : typeof value;
  const kind = (value as { kind?: unknown }).kind;
  if (kind === "transition") return "a transition effect, which runs between two charts rather than on one mark";
  if (kind === "geometry" || kind === "data") return `a ${kind} effect without run(), end() and clear()`;
  return kind === undefined ? "an object with no kind" : `an effect of kind ${JSON.stringify(kind)}`;
}
