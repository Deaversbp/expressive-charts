// What a chart's labels() reports: each mark's labels as drawn, by key and role, with their text,
// where they sit in the chart's <svg>, and their <text>.

import type { TextPlacement } from "../render/text";
import type { ChartLabel } from "../types";

/** The label `element` drawn as `placement`, in a list for flatMap: empty when it isn't shown (no placement) or has no text. */
export function chartLabel(key: string, role: ChartLabel["role"], placement: TextPlacement | undefined, element: SVGTextElement): ChartLabel[] {
  if (!placement || placement.text === "") return [];
  return [{ key, role, text: placement.text, x: placement.x, y: placement.y, anchor: placement.anchor, element }];
}
