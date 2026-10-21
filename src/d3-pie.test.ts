// A D3 pie through expressive(), with real D3: d3.pie() with its default sort, paths from d3.arc()
// inside a centred <g>, joined with d3-selection, each slice described with describe.arc. This is
// M3's proof that effects are chart-agnostic: travel, flash and the focus ring work on the slices
// with no change to effect code. It brings charts and effects together, so it lives beside
// src/index.ts, the only module allowed to.

import { select } from "d3-selection";
import { arc, pie, type PieArcDatum } from "d3-shape";
import { expressive, type ChartEnv, type ExpressiveOptions } from "./charts";
import { createMotion, describe as build, manualClock, matrix, type Point } from "./core";
import { parseTransform } from "./core/geometry";
import { flash, travel } from "./effects";
import { soccerBall } from "./icons/sport";
import { iconRegistry, presetRegistry } from "./registries";

interface Shot {
  outcome: string;
  shots: number;
}

type Slice = PieArcDatum<Shot>;

const season: Shot[] = [
  { outcome: "Goal", shots: 58 },
  { outcome: "Saved", shots: 112 },
  { outcome: "Off target", shots: 149 },
  { outcome: "Blocked", shots: 87 }
];

/** d3.pie() sorts slices by value, largest first from 12 o'clock, but returns them in data order. */
const RING = ["Off target", "Saved", "Blocked", "Goal"];
const INNER = 70;
const OUTER = 116;
/** The walk's radius. */
const MID = (INNER + OUTER) / 2;
const TURN = 2 * Math.PI;
const fills: Record<string, string> = { Goal: "#2a78d6", Saved: "#eb6834", "Off target": "#1baa7c", Blocked: "#9a6bd6" };

/** The page's donut: a 640 × 300 <svg>, a <g> centred at (320, 150), and one path per outcome, joined by outcome. */
function d3Pie(rows: Shot[] = season) {
  const svg = select(document.body).append("svg").attr("width", 640).attr("height", 300).attr("role", "group").attr("aria-label", "Shots by outcome");
  const plot = svg.append("g").attr("transform", "translate(320,150)");
  const layout = pie<Shot>().value((d) => d.shots);
  const shape = arc<Slice>().innerRadius(INNER).outerRadius(OUTER);
  const draw = (next: Shot[]) =>
    plot
      .selectAll<SVGPathElement, Slice>("path")
      .data(layout(next), (d) => d.data.outcome)
      .join("path")
      .attr("d", shape)
      .attr("fill", (d) => fills[d.data.outcome]!);
  let slices = draw(rows);
  return {
    svg: svg.node()!,
    slices: () => slices,
    slice: (outcome: string): SVGPathElement => slices.filter((d) => d.data.outcome === outcome).node()!,
    redraw(next: Shot[]): void {
      slices = draw(next);
    }
  };
}

function env(): ChartEnv & { clock: ReturnType<typeof manualClock> } {
  const motion = createMotion({ mode: "presentation", reducedMotion: { matches: false, subscribe: () => () => {} } });
  return { presets: presetRegistry, icons: iconRegistry, motion, clock: manualClock() };
}

/** The attachment the README shows: key, value, the arc generator's radii, keyboard and a name per slice. */
function attach(host: ReturnType<typeof d3Pie>, more: Partial<ExpressiveOptions<Slice>> = {}) {
  const { clock, ...rest } = env();
  const fx = expressive(
    host.slices(),
    {
      key: (d) => d.data.outcome,
      value: (d) => d.value,
      geometry: (_el, d, key) => build.arc({ key, cx: 0, cy: 0, inner: INNER, outer: OUTER, start: d.startAngle, end: d.endAngle }),
      keyboard: true,
      markLabel: (d) => `${d.data.outcome}: ${d.value} shots`,
      ...more
    },
    { ...rest, clock }
  );
  return { fx, clock };
}

/** Goal scores three more: its value changes, and every arc moves round as the total grows. */
const threeMore = season.map((shot) => (shot.outcome === "Goal" ? { ...shot, shots: 61 } : shot));

const datum = (element: Element | null): Slice => (element as unknown as { __data__: Slice }).__data__;
const outcomeOf = (element: Element | null): string => datum(element).data.outcome;
const overlayOf = (svg: SVGSVGElement): SVGGElement => svg.querySelector(":scope > .ec-overlay")!;

function pointer(type: string, target: Element): void {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: "mouse" }));
}

function key(name: string): void {
  document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
}

/** A point's angle about the pie's centre as d3.pie() measures it: clockwise from 12 o'clock, in [0, 2π). */
function clockAngle(point: Point): number {
  const angle = Math.atan2(point.x, -point.y);
  return angle < 0 ? angle + TURN : angle;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("a D3 pie through expressive()", () => {
  it("describes each slice with describe.arc, in the centred group's coordinates", () => {
    const host = d3Pie();
    // No type argument: the selection's types give the callbacks their row.
    const fx = expressive(
      host.slices(),
      { key: (d) => d.data.outcome, geometry: (_el, d, key) => build.arc({ key, cx: 0, cy: 0, inner: INNER, outer: OUTER, start: d.startAngle, end: d.endAngle }) },
      env()
    );
    // Document order is data order; the marks go round the ring.
    expect(host.slices().nodes().map(outcomeOf)).toEqual(["Goal", "Saved", "Off target", "Blocked"]);
    const marks = fx.marks();
    expect(marks.map((mark) => mark.key)).toEqual(RING);
    for (const mark of marks) {
      const d = datum(host.slice(mark.key));
      expect(mark.pivot).toEqual({ x: 0, y: 0 });
      expect(mark.length).toBeCloseTo(MID * (d.endAngle - d.startAngle), 2);
      expect(clockAngle(mark.center)).toBeCloseTo((d.startAngle + d.endAngle) / 2, 6);
    }
    // The largest slice starts at 12 o'clock, on the mid-radius arc.
    expect(marks[0]!.start.x).toBeCloseTo(0, 6);
    expect(marks[0]!.start.y).toBeCloseTo(-MID, 6);
    // The overlay draws in the group's coordinates, from the root.
    expect(host.svg.lastElementChild).toBe(overlayOf(host.svg));
    expect(overlayOf(host.svg).getAttribute("transform")).toBe("matrix(1 0 0 1 320 150)");
  });

  it("plays hover from the pointer on a slice", () => {
    const host = d3Pie();
    const { fx } = attach(host, { on: { hover: travel(soccerBall) } });
    const events: string[] = [];
    fx.on("hover", (e) => events.push(`hover ${e.mark.key} ${e.source}`));
    fx.on("leave", (e) => events.push(`leave ${e.mark.key}`));

    pointer("pointerover", host.slice("Saved"));
    expect(overlayOf(host.svg).querySelector('.ec-run[data-key="Saved"] .ec-icon')).not.toBeNull();
    pointer("pointerover", host.slice("Goal"));
    pointer("pointerleave", host.svg);
    expect(events).toEqual(["hover Saved pointer", "leave Saved", "hover Goal pointer", "leave Goal"]);
    expect(overlayOf(host.svg).querySelector(".ec-icon")).toBeNull();
  });

  it("moves keyboard focus clockwise from 12 o'clock, with Home and End, and reads the ring again on refresh", () => {
    const host = d3Pie();
    const { fx } = attach(host);
    // The tab stop is the first slice clockwise from 12 o'clock, not the first in the document.
    expect(RING.map((outcome) => host.slice(outcome).getAttribute("tabindex"))).toEqual(["0", "-1", "-1", "-1"]);
    host.slice("Off target").focus();

    const visits: string[] = [];
    for (const name of ["ArrowRight", "ArrowDown", "ArrowRight", "ArrowRight", "Home", "End", "ArrowLeft", "ArrowUp"]) {
      key(name);
      visits.push(outcomeOf(document.activeElement));
    }
    // The arrows stop at either end, as on a bar chart.
    expect(visits).toEqual(["Saved", "Blocked", "Goal", "Goal", "Off target", "Goal", "Blocked", "Saved"]);

    // Goal overtakes Saved, so d3.pie() puts it second: the order follows.
    host.redraw(season.map((shot) => (shot.outcome === "Goal" ? { ...shot, shots: 120 } : shot)));
    fx.refresh(host.slices());
    expect(fx.marks().map((mark) => mark.key)).toEqual(["Off target", "Goal", "Saved", "Blocked"]);
    expect(document.activeElement).toBe(host.slice("Saved"));
    key("ArrowLeft");
    expect(outcomeOf(document.activeElement)).toBe("Goal");
  });

  it("names each slice for screen readers with markLabel, and again on refresh", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const host = d3Pie();
    const { fx } = attach(host);
    const aria = (outcome: string) => ["role", "aria-label", "aria-hidden"].map((name) => host.slice(outcome).getAttribute(name));
    expect(RING.map(aria)).toEqual([
      ["img", "Off target: 149 shots", null],
      ["img", "Saved: 112 shots", null],
      ["img", "Blocked: 87 shots", null],
      ["img", "Goal: 58 shots", null]
    ]);
    host.redraw(threeMore);
    fx.refresh(host.slices());
    expect(aria("Goal")).toEqual(["img", "Goal: 61 shots", null]);
    // The <svg> is a group, so the slices inside it are read.
    expect(warn).not.toHaveBeenCalled();
  });

  it("with value, updates only the slice whose value changed; every other slice moves round", () => {
    const host = d3Pie();
    const { fx, clock } = attach(host, { on: { update: flash() } });
    const updates: string[] = [];
    fx.on("update", (e) => updates.push(`${e.mark.key} from ${e.from.length.toFixed(1)}`));
    const before = new Map(fx.marks().map((mark) => [mark.key, mark.length]));

    host.redraw(threeMore);
    fx.refresh(host.slices());
    expect(updates).toEqual([`Goal from ${before.get("Goal")!.toFixed(1)}`]);
    // Every arc changed length, and the marks follow the new arcs.
    for (const mark of fx.marks()) {
      const d = datum(host.slice(mark.key));
      expect(mark.length).not.toBeCloseTo(before.get(mark.key)!, 1);
      expect(mark.length).toBeCloseTo(MID * (d.endAngle - d.startAngle), 2);
    }
    // So update: flash blinks the one slice whose value changed.
    for (let frame = 0; frame < 10; frame++) clock.advance(16);
    const halos = overlayOf(host.svg).querySelectorAll(".ec-halos > .ec-halo > path");
    expect(Array.from(halos, (path) => path.getAttribute("d"))).toEqual([fx.marks().find((mark) => mark.key === "Goal")!.outline.d]);
  });

  it("without value, updates every slice, because every arc's length changes", () => {
    const host = d3Pie();
    const { fx } = attach(host, { value: undefined });
    const updates: string[] = [];
    fx.on("update", (e) => updates.push(e.mark.key));
    host.redraw(threeMore);
    fx.refresh(host.slices());
    expect(updates).toEqual(RING);
  });

  it("travel rolls a ball around a slice, the icon following the arc", () => {
    const host = d3Pie();
    const { clock } = attach(host, { on: { hover: travel(soccerBall) } });
    const saved = datum(host.slice("Saved"));
    pointer("pointerover", host.slice("Saved"));

    const path: Point[] = [];
    for (let frame = 0; frame < 200 && !clock.idle; frame++) {
      clock.advance(16);
      const icon = overlayOf(host.svg).querySelector('.ec-run[data-key="Saved"] .ec-icon')!;
      path.push(matrix.apply(parseTransform(icon.getAttribute("transform") ?? ""), soccerBall.anchor));
    }
    expect(clock.idle).toBe(true);
    expect(path.length).toBeGreaterThan(10);
    const angles = path.map(clockAngle);
    for (const [i, point] of path.entries()) {
      // On the mid-radius arc, inside the slice, and only ever clockwise.
      expect(Math.hypot(point.x, point.y)).toBeCloseTo(MID, 1);
      expect(angles[i]).toBeGreaterThan(saved.startAngle);
      expect(angles[i]).toBeLessThan(saved.endAngle);
      if (i > 0) expect(angles[i]).toBeGreaterThanOrEqual(angles[i - 1]!);
    }
    // It comes to rest at the end, inset by the ball's radius.
    expect(angles[angles.length - 1]).toBeCloseTo(saved.endAngle - 8.5 / MID, 2);
  });

  it("draws the focus ring and a halo around a slice's outline", () => {
    const host = d3Pie();
    const { fx, clock } = attach(host, { on: { hover: flash() } });
    fx.focus("Saved");
    const outline = fx.marks().find((mark) => mark.key === "Saved")!.outline;
    expect(outline.closed).toBe(true);

    // The ring: an 8 px stroke on the outline, masked to outside the slice and its 2 px gap.
    const overlay = overlayOf(host.svg);
    const ring = overlay.querySelector(".ec-focus-ring")!;
    expect(ring.getAttribute("visibility")).toBeNull();
    expect(ring.getAttribute("d")).toBe(outline.d);
    expect(ring.getAttribute("stroke-width")).toBe("8");
    const hole = overlay.querySelector(`${ring.getAttribute("mask")!.slice(4, -1)} path`)!;
    expect(["d", "fill", "stroke-width"].map((name) => hole.getAttribute(name))).toEqual([outline.d, "black", "4"]);

    // The halo flash draws on hover (focus plays it): along the same outline, in the slice's own colour.
    for (let frame = 0; frame < 10; frame++) clock.advance(16);
    const halo = Array.from(overlay.querySelectorAll<SVGPathElement>(".ec-halos > .ec-halo > path"));
    expect(halo.map((path) => path.getAttribute("d"))).toEqual([outline.d]);
    expect(Number(halo[0]!.getAttribute("stroke-width"))).toBeGreaterThan(0);
    expect(halo[0]!.style.getPropertyValue("stroke")).toMatch(/^(#eb6834|rgb\(235, 104, 52\))$/);
  });

  it("destroy() leaves the DOM as D3 drew it", () => {
    const host = d3Pie();
    const before = host.svg.outerHTML;
    const { fx, clock } = attach(host, { dim: true, on: { hover: travel(soccerBall), update: flash() } });
    pointer("pointerover", host.slice("Saved"));
    fx.focus("Goal");
    for (let frame = 0; frame < 5; frame++) clock.advance(16);
    expect(host.svg.outerHTML).not.toBe(before);

    fx.destroy();
    expect(host.svg.outerHTML).toBe(before);
    // Nothing happens afterwards.
    pointer("pointerover", host.slice("Saved"));
    fx.refresh();
    expect(host.svg.outerHTML).toBe(before);
  });
});
