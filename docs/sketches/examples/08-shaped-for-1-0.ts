// What 0.13.0 changed on the way to 1.0, as a page writes it: motionSwitch()'s options, the order of
// geometry's arguments, and an icon with square caps and bevel joins.
import { createMotion, defineIcon, describe, expressive, motionSwitch, travel, type IconShape, type MotionSwitch, type Paint } from "expressive-charts";
import type { Selection } from "./d3-shim";

// ── motionSwitch(target, options?) ───────────────────────────────────────────

const own = createMotion({ mode: "analysis" });

motionSwitch("#motion"); // the page-wide motion
motionSwitch("#motion", { persist: "site:motion" }); // no `undefined` to step over
motionSwitch("#dashboard-motion", { motion: own, label: "Dashboard motion" });

// The form before 0.13.0 still compiles and still works, marked @deprecated (an editor strikes it
// through). 1.0 takes it out.
const before: MotionSwitch = motionSwitch("#motion", own, { persist: "site:motion" });
motionSwitch("#motion", own);
motionSwitch("#motion", undefined, { persist: "site:motion" });
before.destroy();

// @ts-expect-error a second argument that is neither options nor a Motion
motionSwitch("#motion", 42);
// @ts-expect-error the motion among the options is a Motion, not a mode
motionSwitch("#motion", { motion: "analysis" });

// ── geometry: (datum, element, key) ──────────────────────────────────────────

interface Source {
  source: string; // "Search", "Social", "Email"
  sessions: number;
}

// One <polygon> a traffic source, drawn by the page, which the adapter would read as a plain shape.
declare const sources: Selection<SVGPolygonElement, Source>;
declare const outlineOf: (element: Element) => string;

expressive(sources, {
  key: (d) => d.source,
  value: (d) => d.sessions,
  // The row first, then the element, as key and value take them; then the key.
  geometry: (d, element, key) => describe.shape({ key, series: d.source, d: outlineOf(element) }),
  on: { hover: "flash" }
});

expressive<Source>(sources, {
  key: (d) => d.source,
  // @ts-expect-error 0.12's order, the element first: a page in TypeScript gets this error to fix
  geometry: (element: Element, d: Source, key: string) => describe.shape({ key, series: d.source, d: outlineOf(element) })
});

// ── Square caps and bevel joins ──────────────────────────────────────────────

// A tick mark as a technical icon set draws one: square ends, and a bevel where the stroke turns.
const tick = defineIcon({
  name: "tick",
  shapes: [{ d: "M-6,0L-2,4L6,-4", stroke: "text", width: 2, linecap: "square", linejoin: "bevel" }],
  box: { x: -7, y: -5, width: 14, height: 10 },
  anchor: { x: 0, y: 0 }
});
expressive(sources, { key: (d) => d.source, on: { hover: travel(tick) } });

// Code that reads a cap or a join and handles every case has one more of each to handle. A renderer of
// an effect author's own, say, writing a canvas's lineCap and lineJoin:
export function capOf(shape: IconShape | Paint): CanvasLineCap {
  switch (shape.linecap) {
    case "round":
      return "round";
    case "square": // new in 0.13.0
      return "square";
    case "butt":
    case undefined:
      return "butt";
    default:
      return unreachable(shape.linecap);
  }
}
export function joinOf(shape: IconShape): CanvasLineJoin {
  switch (shape.linejoin) {
    case "round":
      return "round";
    case "bevel": // new in 0.13.0
      return "bevel";
    case "miter":
    case undefined:
      return "miter";
    default:
      return unreachable(shape.linejoin);
  }
}
/** Compiles only while every case above is handled, so a wider union is an error here until it's handled. */
declare function unreachable(value: never): never;
