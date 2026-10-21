// The neutral icons that ship with the core. They're drawn in theme colours, so they read in light
// and dark themes and on any series colour. Domain icons live in optional packs (./sport).

import type { Icon } from "../core";
import { defineIcon } from "./define";

/** A plain marker, outlined so it shows on any bar. */
const dot = /* @__PURE__ */ defineIcon({
  name: "dot",
  shapes: [{ d: "M4,0A4,4 0 0 1 -4,0A4,4 0 0 1 4,0Z", fill: "surface", stroke: "text", width: 1.5 }],
  box: { x: -5, y: -5, width: 10, height: 10 },
  anchor: { x: 0, y: 0 }
});

/** Points the way it travels, with a halo in the surface colour. */
const arrow = /* @__PURE__ */ defineIcon({
  name: "arrow",
  shapes: [{ d: "M-7,-1.5L1,-1.5L1,-5L7,0L1,5L1,1.5L-7,1.5Z", fill: "text", stroke: "surface", width: 1.5, linejoin: "round" }],
  box: { x: -8, y: -6, width: 16, height: 12 },
  anchor: { x: 0, y: 0 }
});

/** A light-weight pointer: a stroked ">" over a wider halo. */
const chevron = /* @__PURE__ */ defineIcon({
  name: "chevron",
  shapes: [
    { d: "M-2.5,-5L2.5,0L-2.5,5", stroke: "surface", width: 4.5, linecap: "round", linejoin: "round" },
    { d: "M-2.5,-5L2.5,0L-2.5,5", stroke: "text", width: 2, linecap: "round", linejoin: "round" }
  ],
  box: { x: -5, y: -7.5, width: 10, height: 15 },
  anchor: { x: 0, y: 0 }
});

/** The built-in icons, registered by name in every chart: `travel("arrow")` or `travel(icons.arrow)`. */
export const icons: { readonly dot: Icon; readonly arrow: Icon; readonly chevron: Icon } = /* @__PURE__ */ Object.freeze({ dot, arrow, chevron });
