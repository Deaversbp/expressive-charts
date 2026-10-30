// A D3 pie through expressive(), with real D3: d3.pie() with its default sort, paths from d3.arc()
// inside a centred <g>, joined with d3-selection, each slice described with describe.arc. This is
// M3's proof that effects are chart-agnostic: travel, flash and the focus ring work on the slices
// with no change to effect code. It brings charts and effects together, so it lives beside
// src/index.ts, the only module allowed to.

import { select } from "d3-selection";
import { arc, pie, type PieArcDatum } from "d3-shape";
import { expressive, type ChartEnv, type ExpressiveOptions } from "./charts";
import { createMotion, describe as build, manualClock, matrix, type MarkGeometry, type Point } from "./core";
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

describe("a D3 pie read by tag, with no geometry", () => {
  /** The angles of each row's slice, as d3.pie() lays them out: by value from 12 o'clock, or in data order. */
  const layout = (rows: Shot[], sort: "value" | "none" = "value"): Slice[] => {
    const lay = pie<Shot>().value((d) => d.shots);
    if (sort === "none") lay.sort(null);
    return lay(rows);
  };

  /** A pie or a donut as D3 code draws one, with nothing for expressive(): its arcs in a <g> moved to (320, 150). */
  function d3Ring(slices: Slice[], shape = arc<Slice>().innerRadius(INNER).outerRadius(OUTER)) {
    const svg = select(document.body).append("svg").attr("width", 640).attr("height", 300).attr("role", "group");
    const plot = svg.append("g").attr("transform", "translate(320,150)");
    const paths = plot
      .selectAll<SVGPathElement, Slice>("path")
      .data(slices, (d) => d.data.outcome)
      .join("path")
      .attr("d", shape)
      .attr("fill", (d) => fills[d.data.outcome] ?? "#888");
    return { svg: svg.node()!, plot: plot.node()!, paths };
  }

  /** Attached with only a key: every path is read by its tag. */
  const byTag = (source: Parameters<typeof expressive<Slice>>[0], more: Partial<ExpressiveOptions<Slice>> = {}) => expressive<Slice>(source, { key: (d) => d.data.outcome, ...more }, env());

  /** What can be compared of a shape: everything but its functions. */
  const seen = (mark: MarkGeometry) => ({ key: mark.key, d: mark.outline.d, closed: mark.outline.closed, length: mark.length, thickness: mark.thickness, bounds: mark.bounds, center: mark.center });

  /** Every point a mark is drawn and walked by: its ends, centre and pivot, its walk, and its outline. */
  const pointsOf = (mark: MarkGeometry): Point[] => [mark.start, mark.end, mark.center, mark.pivot, ...[0, 0.25, 0.5, 0.75, 1].map((t) => mark.path(t)), ...mark.outline.sample(64)];

  /** The marks are those slices, in that order, each within 0.5 px: every point, and the length, thickness and bounds. */
  function expectSlices(marks: readonly MarkGeometry[], slices: readonly MarkGeometry[]): void {
    expect(marks.map((mark) => mark.key)).toEqual(slices.map((s) => s.key));
    marks.forEach((mark, i) => {
      const expected = slices[i]!;
      const expectedPoints = pointsOf(expected);
      const off = pointsOf(mark).map((p, j) => Math.hypot(p.x - expectedPoints[j]!.x, p.y - expectedPoints[j]!.y));
      expect(Math.max(...off), mark.key).toBeLessThanOrEqual(0.5);
      for (const name of ["length", "thickness"] as const) expect(Math.abs(mark[name] - expected[name]), `${mark.key} ${name}`).toBeLessThanOrEqual(0.5);
      for (const name of ["x", "y", "width", "height"] as const) expect(Math.abs(mark.bounds[name] - expected.bounds[name]), `${mark.key} bounds`).toBeLessThanOrEqual(0.5);
      expect(mark.outline.closed, mark.key).toBe(true);
    });
  }

  interface Placed {
    readonly cx?: number;
    readonly cy?: number;
    readonly inner?: number;
    readonly outer?: number;
    /** Radians added to each angle. */
    readonly turn?: number;
    readonly key?: (outcome: string) => string;
  }

  /** describe.arc's slices for the rows, clockwise from 12 o'clock: what a page would give as geometry, in that order. */
  function arcs(slices: readonly Slice[], { cx = 0, cy = 0, inner = INNER, outer = OUTER, turn = 0, key = (outcome) => outcome }: Placed = {}): MarkGeometry[] {
    const middle = (d: Slice) => ((((d.startAngle + d.endAngle) / 2 + turn) % TURN) + TURN) % TURN;
    return [...slices]
      .sort((a, b) => middle(a) - middle(b))
      .map((d) => build.arc({ key: key(d.data.outcome), cx, cy, inner, outer, start: d.startAngle + turn, end: d.endAngle + turn }));
  }

  /** The classic D3 pie: a <g class="arc"> a slice, each turned 30° and scaled 1.5 times, in a group moved to (320, 200). */
  function turnedPie(slices: Slice[]) {
    const plot = select(document.body).append("svg").attr("width", 640).attr("height", 400).append("g").attr("transform", "translate(320,200)");
    const groups = plot.selectAll<SVGGElement, Slice>("g").data(slices).join("g").attr("class", "arc").attr("transform", "rotate(30) scale(1.5)");
    return { plot, groups, paths: groups.append("path").attr("d", arc<Slice>().innerRadius(INNER).outerRadius(OUTER)) };
  }

  it("reads each slice of a donut as the mark describe.arc gives it, within 0.5 px, clockwise from 12 o'clock, sorted by value and in data order", () => {
    for (const sort of ["value", "none"] as const) {
      const slices = layout(season, sort);
      const fx = byTag(d3Ring(slices).paths);
      expectSlices(fx.marks(), arcs(slices));
      expect(fx.marks().map((mark) => mark.key)).toEqual(sort === "value" ? RING : ["Goal", "Saved", "Off target", "Blocked"]);
      // One centre, to D3's 3 decimals.
      for (const mark of fx.marks()) expect(Math.hypot(mark.pivot.x, mark.pivot.y)).toBeLessThan(0.01);
      document.body.replaceChildren();
    }
  });

  it("reads a pie's slices, with no inner radius, as describe.arc's, and a pie's padded slices as slices of the padded angles", () => {
    const slices = layout(season);
    expectSlices(byTag(d3Ring(slices, arc<Slice>().innerRadius(0).outerRadius(OUTER)).paths).marks(), arcs(slices, { inner: 0 }));
    // A pie's padded slice still has its sides through the centre: d3.arc() pads only its arc.
    const padded = slices.map((d) => ({ ...d, padAngle: 0.04 }));
    const narrower = padded.map((d) => ({ ...d, startAngle: d.startAngle + 0.02, endAngle: d.endAngle - 0.02 }));
    expectSlices(byTag(d3Ring(padded, arc<Slice>().innerRadius(0).outerRadius(OUTER)).paths).marks(), arcs(narrower, { inner: 0 }));
  });

  it("keeps a ring's clockwise order with a sliver whose inner arc rounds away, and with a slice of half the ring", () => {
    // In data order, Saved is half the ring from 72°, where d3's rounding leaves its arc's own centre a third of a px out.
    for (const [rows, sort] of [
      [
        [
          { outcome: "Sliver", shots: 1 },
          { outcome: "Saved", shots: 300_000 },
          { outcome: "Off target", shots: 700_000 }
        ],
        "value"
      ],
      [
        [
          { outcome: "Goal", shots: 20 },
          { outcome: "Saved", shots: 50 },
          { outcome: "Off target", shots: 30 }
        ],
        "none"
      ]
    ] as const) {
      const slices = layout([...rows], sort);
      expectSlices(byTag(d3Ring(slices).paths).marks(), arcs(slices));
      document.body.replaceChildren();
    }
  });

  it("reads a whole ring as describe.arc's whole turn, and a whole disc as a circle, a closed shape, as before", () => {
    const [whole] = layout([{ outcome: "Goal", shots: 58 }]);
    expectSlices(byTag(d3Ring([whole!]).paths).marks(), arcs([whole!]));
    const disc = d3Ring([whole!], arc<Slice>().innerRadius(0).outerRadius(OUTER)).paths;
    expect(byTag(disc).marks().map(seen)).toEqual([seen(build.shape({ key: "Goal", d: disc.attr("d") }))]);
  });

  it("reads slices whose groups turn and scale them below the marks' common ancestor, clockwise round their centre", () => {
    const slices = layout(season);
    const fx = byTag(turnedPie(slices).paths);
    expectSlices(fx.marks(), arcs(slices, { inner: INNER * 1.5, outer: OUTER * 1.5, turn: Math.PI / 6 }));
    // Off target, the largest, starts at 1 o'clock now, so Goal, across 12 o'clock, comes first.
    expect(fx.marks().map((mark) => mark.key)).toEqual(["Goal", "Off target", "Saved", "Blocked"]);
  });

  it("reads slices through a browser's CTMs, rounded to single precision as a browser's are", () => {
    const slices = layout(season);
    const { plot, groups, paths } = turnedPie(slices);
    const ctm = (m: readonly number[]) => () => {
      const [a, b, c, d, e, f] = m.map((value) => Math.fround(value));
      return { a, b, c, d, e, f };
    };
    Object.assign(plot.node()!, { getScreenCTM: ctm([1, 0, 0, 1, 320, 200]) });
    for (const group of groups.nodes()) Object.assign(group, { getScreenCTM: ctm(parseTransform("translate(320,200) rotate(30) scale(1.5)")) });
    expectSlices(byTag(paths).marks(), arcs(slices, { inner: INNER * 1.5, outer: OUTER * 1.5, turn: Math.PI / 6 }));
  });

  it("reads small multiples turned, scaled and flipped, each round its own centre, in document order, and one stretched unevenly as shapes, as before", () => {
    const slices = layout(season);
    const svg = select(document.body).append("svg").attr("width", 640).attr("height", 500);
    const pies = [
      ["turned", "translate(110,150) rotate(30)"],
      ["scaled", "translate(320,150) scale(1.5)"],
      ["flipped", "translate(530,150) scale(-1,1)"],
      ["stretched", "translate(320,400) scale(2,1)"]
    ] as const;
    const shape = arc<Slice>().innerRadius(30).outerRadius(60);
    for (const [name, transform] of pies) svg.append("g").attr("class", name).attr("transform", transform).selectAll("path").data(slices).join("path").attr("d", shape);
    const paths = svg.selectAll<SVGPathElement, Slice>("path");
    const keyOf = (element: Element, d: Slice) => `${element.parentElement!.getAttribute("class")}: ${d.data.outcome}`;
    const marks = expressive<Slice>(paths, { key: (d, element) => keyOf(element, d) }, env()).marks();
    // Document order, since no one centre is shared: each pie's slices in data order.
    expect(marks.map((mark) => mark.key)).toEqual(pies.flatMap(([name]) => slices.map((d) => `${name}: ${d.data.outcome}`)));
    const ofPie = (name: string) => marks.filter((mark) => mark.key.startsWith(`${name}:`));
    const inDataOrder = (name: string, placed: Placed, from = slices) => {
      const expected = arcs(from, { ...placed, key: (outcome) => `${name}: ${outcome}` });
      return slices.map((d) => expected.find((mark) => mark.key === `${name}: ${d.data.outcome}`)!);
    };
    expectSlices(ofPie("turned"), inDataOrder("turned", { cx: 110, cy: 150, inner: 30, outer: 60, turn: Math.PI / 6 }));
    expectSlices(ofPie("scaled"), inDataOrder("scaled", { cx: 320, cy: 150, inner: 45, outer: 90 }));
    // A flip turns each slice the other way round, from 12 o'clock.
    const mirrored = slices.map((d) => ({ ...d, startAngle: -d.startAngle, endAngle: -d.endAngle }));
    expectSlices(ofPie("flipped"), inDataOrder("flipped", { cx: 530, cy: 150, inner: 30, outer: 60 }, mirrored));
    const stretched = svg.selectAll<SVGPathElement, Slice>("g.stretched > path").nodes();
    expect(ofPie("stretched").map(seen)).toEqual(
      stretched.map((path) => seen(build.shape({ key: keyOf(path, datum(path)), d: path.getAttribute("d")!, matrix: parseTransform("translate(320,400) scale(2,1)") })))
    );
  });

  it("reads a donut with a pad angle or rounded corners as shapes, as before", () => {
    const padded = layout(season).map((d) => ({ ...d, padAngle: 0.04 }));
    for (const [slices, shape] of [
      [padded, arc<Slice>().innerRadius(INNER).outerRadius(OUTER)],
      [layout(season), arc<Slice>().innerRadius(INNER).outerRadius(OUTER).cornerRadius(6)]
    ] as const) {
      const { paths } = d3Ring(slices, shape);
      // Shapes keep document order: data order.
      expect(byTag(paths).marks().map(seen)).toEqual(paths.nodes().map((path) => seen(build.shape({ key: outcomeOf(path), d: path.getAttribute("d")! }))));
      document.body.replaceChildren();
    }
  });

  it("reads the donut page's pie, at 640 and 320 px wide and sorted either way, as its geometry describes it, within 0.5 px", () => {
    /** demo/d3-pie.ts's sizes: an outer radius of 108 px at most, with room beside it for the labels, and the hole 0.6 of it. */
    const page = (width: number) => {
      const outer = Math.max(48, Math.min(108, width / 2 - 84));
      return { width, inner: outer * 0.6, outer };
    };
    const nextMatch = season.map((shot) => ({ ...shot, shots: shot.shots + (shot.outcome === "Saved" ? 5 : 2) }));
    for (const { width, inner, outer } of [page(640), page(320)]) {
      for (const sort of ["value", "none"] as const) {
        for (const rows of [season, nextMatch]) {
          const plot = select(document.body).append("svg").attr("viewBox", `0 0 ${width} 300`).append("g").attr("class", "pie-plot").attr("transform", `translate(${width / 2},150)`);
          const paths = plot
            .selectAll<SVGPathElement, Slice>("path.slice")
            .data(layout(rows, sort), (d) => d.data.outcome)
            .join("path")
            .attr("class", "slice")
            .attr("d", arc<Slice>().innerRadius(inner).outerRadius(outer));
          const given = expressive<Slice>(paths, { key: (d) => d.data.outcome, geometry: (_el, d, key) => build.arc({ key, cx: 0, cy: 0, inner, outer, start: d.startAngle, end: d.endAngle }) }, env());
          expectSlices(byTag(paths).marks(), given.marks());
          document.body.replaceChildren();
        }
      }
    }
  });

  it("plays effects on the slices it reads as on slices from geometry: keyboard order, the focus ring, and travel round a slice", () => {
    const host = d3Pie();
    const { fx, clock } = attach(host, { geometry: undefined, on: { hover: travel(soccerBall) } });
    expect(RING.map((outcome) => host.slice(outcome).getAttribute("tabindex"))).toEqual(["0", "-1", "-1", "-1"]);
    const saved = datum(host.slice("Saved"));
    fx.focus("Saved");
    expect(overlayOf(host.svg).querySelector(".ec-focus-ring")!.getAttribute("d")).toBe(fx.marks().find((mark) => mark.key === "Saved")!.outline.d);
    const path: Point[] = [];
    for (let frame = 0; frame < 200 && !clock.idle; frame++) {
      clock.advance(16);
      const icon = overlayOf(host.svg).querySelector('.ec-run[data-key="Saved"] .ec-icon')!;
      path.push(matrix.apply(parseTransform(icon.getAttribute("transform") ?? ""), soccerBall.anchor));
    }
    expect(path.length).toBeGreaterThan(10);
    for (const point of path) {
      // On the mid-radius arc, inside the slice.
      expect(Math.abs(Math.hypot(point.x, point.y) - MID)).toBeLessThanOrEqual(0.5);
      expect(clockAngle(point)).toBeGreaterThan(saved.startAngle);
      expect(clockAngle(point)).toBeLessThan(saved.endAngle);
    }
    expect(clockAngle(path[path.length - 1]!)).toBeCloseTo(saved.endAngle - 8.5 / MID, 2);
  });

  it("follows a D3 transition of the arcs with watch: each frame's slices, clockwise, with no events", async () => {
    const from = layout(season);
    const to = layout(threeMore);
    const host = d3Ring(from);
    const shape = arc<Slice>().innerRadius(INNER).outerRadius(OUTER);
    const { clock, ...rest } = env();
    const fx = expressive<Slice>(host.paths, { key: (d) => d.data.outcome, watch: true }, { ...rest, clock });
    const events: string[] = [];
    for (const type of ["enter", "update", "exit"] as const) fx.on(type, (e) => events.push(`${type} ${e.mark.key}`));
    for (const k of [0.25, 0.5, 0.75, 1]) {
      // What d3's attrTween writes each frame: each arc's angles part way.
      const frame = from.map((d, i) => ({ ...d, startAngle: d.startAngle + (to[i]!.startAngle - d.startAngle) * k, endAngle: d.endAngle + (to[i]!.endAngle - d.endAngle) * k }));
      host.paths.data(frame, (d) => d.data.outcome).attr("d", shape);
      await new Promise((resolve) => setTimeout(resolve, 0));
      clock.advance(16);
      expectSlices(fx.marks(), arcs(frame));
    }
    expect(events).toEqual([]);
  });
});
