// Categorical colours follow the entity: a key keeps its palette slot through sorts, filters and
// updates, and charts can share an assignment so the same entity has the same colour in both.

import { PALETTE_SIZE } from "./render/theme";

export interface ColorAssignment {
  /** The palette slot (1–8) for a key: its pinned slot, or the next free one the first time it's seen. Never reassigned. */
  slot(key: string): number;
}

/** `fixed` pins slots, as in the prototype's `{ goals: 1, assists: 4 }`. Other keys take free slots in the order they're first seen. */
export function colorAssignment(fixed: Readonly<Record<string, number>> = {}): ColorAssignment {
  const slots = new Map<string, number>();
  for (const [key, slot] of Object.entries(fixed)) {
    if (!Number.isInteger(slot) || slot < 1 || slot > PALETTE_SIZE) {
      throw new RangeError(`colorAssignment: the slot for "${key}" must be a whole number from 1 to ${PALETTE_SIZE}, got ${String(slot)}.`);
    }
    slots.set(key, slot);
  }
  return {
    slot(key) {
      let slot = slots.get(key);
      if (slot === undefined) {
        const used = new Set(slots.values());
        slot = 1;
        while (used.has(slot) && slot <= PALETTE_SIZE) slot++;
        // Every slot taken: reuse them in turn.
        if (slot > PALETTE_SIZE) slot = (slots.size % PALETTE_SIZE) + 1;
        slots.set(key, slot);
      }
      return slot;
    }
  };
}

/** The `colors` option as an assignment: a shared one as is, a record as pinned slots. */
export function toColorAssignment(colors: ColorAssignment | Readonly<Record<string, number>> | undefined): ColorAssignment {
  if (colors && typeof (colors as ColorAssignment).slot === "function") return colors as ColorAssignment;
  return colorAssignment(colors as Readonly<Record<string, number>> | undefined);
}
