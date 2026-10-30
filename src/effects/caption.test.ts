import type { MarkGeometry, Rect } from "../core";
import { describe as build } from "../core";
import { fixtures } from "../testing/fixtures";
import { estimatedBox } from "../core/text-box";
import { captionPlace, type CaptionPlace, type CaptionText } from "./caption";

/** The overlay's text size, and how far its baseline drops below the placed point read sideways (0.36 em) and downwards (0.8 em). */
const SIDEWAYS = 12.5 * 0.36;
const DOWNWARDS = 12.5 * 0.8;

const bar = (labelBounds?: Rect[]): MarkGeometry =>
  build.bar({ key: "Okafor", series: "goals", x: 60, y: 10, width: 200, height: 20, baseline: "left", ...(labelBounds ? { labelBounds } : {}) });

describe("captionPlace", () => {
  it("puts text 10 px past the end of a walk with no labels, read away from the mark", () => {
    // A bar growing right: centred on its line, from its start.
    expect(captionPlace(bar())).toEqual({ at: { x: 270, y: 20 + SIDEWAYS }, anchor: "start", toward: 0 });
    // A negative bar reads leftwards, from its end.
    const negative = fixtures["negative bar"];
    const back = captionPlace(negative);
    expect(back.anchor).toBe("end");
    expect(back.at.x).toBeCloseTo(negative.end.x - 10, 9);
    expect(back.at.y).toBeCloseTo(negative.end.y + SIDEWAYS, 9);
    // A column: centred, standing 10 px above its tip.
    const column = fixtures.column;
    const placed = captionPlace(column);
    expect(placed.anchor).toBe("middle");
    expect(placed.at.x).toBeCloseTo(column.end.x, 9);
    expect(placed.at.y).toBeCloseTo(column.end.y - 10, 9);
    // Hanging below a column that grows down.
    const hanging = build.bar({ key: "h", x: 0, y: 0, width: 20, height: 50, baseline: "top" });
    expect(captionPlace(hanging).at.y).toBeCloseTo(60 + DOWNWARDS, 9);
    // Unset and empty labelBounds are the same: nothing in the way.
    expect(captionPlace(bar([]))).toEqual(captionPlace(bar()));
  });

  it("goes 6 px past the farthest label the heading meets, when that's further than 10 px", () => {
    const value = { x: 266, y: 12, width: 24, height: 14 };
    expect(captionPlace(bar([value])).at.x).toBe(296);
    // A label behind the end, or beside the heading, isn't in the way.
    const category = { x: 0, y: 12, width: 54, height: 14 };
    const above = { x: 262, y: -10, width: 80, height: 14 };
    expect(captionPlace(bar([category, value, above])).at.x).toBe(296);
    // Two in a row: past the farther one.
    expect(captionPlace(bar([value, { x: 300, y: 18, width: 40, height: 14 }])).at.x).toBe(346);
    // One that ends within 4 px of the end leaves the 10 px.
    expect(captionPlace(bar([{ x: 250, y: 12, width: 14, height: 14 }])).at.x).toBe(270);
  });

  it("measures along the heading, on a slanted walk too", () => {
    // Up and to the right at 45°: it leaves the box, grown by 6 px, through its top, 31 px up.
    const line = build.line({ key: "goals", points: [{ x: 0, y: 100 }, { x: 100, y: 0 }], labelBounds: [{ x: 95, y: -25, width: 30, height: 30 }] });
    const { at, anchor } = captionPlace(line);
    const along = 31 * Math.SQRT2;
    expect(at.x).toBeCloseTo(100 + along * Math.SQRT1_2, 9);
    // Read upwards at 45°, its baseline is a little below the point: 0.36 em times 1 − sin 45°.
    expect(at.y).toBeCloseTo(-along * Math.SQRT1_2 + SIDEWAYS * (1 - Math.SQRT1_2), 9);
    // 45° from vertical counts as within it.
    expect(anchor).toBe("middle");
  });

  it("puts centred text past a label's top or bottom, though the heading leaves it through a side", () => {
    // Up and to the right at 60°: centred. The heading leaves the box, grown by 6 px, through its right
    // side 26 px along, where the text, reaching out to either side, would be on it; past its top is 68.6 px.
    const end = { x: 50, y: 100 - 50 * Math.sqrt(3) };
    const box = { x: 45, y: -40, width: 12, height: 50 };
    const steep = build.line({ key: "goals", points: [{ x: 0, y: 100 }, end], labelBounds: [box] });
    const { at, anchor } = captionPlace(steep);
    expect(anchor).toBe("middle");
    const along = (end.y + 46) / (Math.sqrt(3) / 2);
    expect(at.x).toBeCloseTo(end.x + along / 2, 9);
    expect(at.y).toBeCloseTo(-46 + SIDEWAYS * (1 - Math.sqrt(3) / 2), 9);
    // Another mark's label the same way goes past its top too.
    expect(captionPlace(build.line({ key: "goals", points: [{ x: 0, y: 100 }, end], nearbyLabels: [box] }))).toEqual({ at, anchor, toward: steep.angle(1) });
    // At 30°, read sideways, it leaves through the side as before: 6 px past the box's right.
    const shallow = build.line({ key: "goals", points: [{ x: 0, y: 100 }, { x: 50, y: 100 - 50 / Math.sqrt(3) }], labelBounds: [{ x: 45, y: 60, width: 12, height: 40 }] });
    expect(captionPlace(shallow).at.x).toBeCloseTo(63, 9);
  });

  it("anchors by the heading: start rightwards, end leftwards, middle within 45° of vertical", () => {
    const heading = (degrees: number) => {
      const radians = (degrees * Math.PI) / 180;
      return captionPlace(build.line({ key: "l", points: [{ x: 0, y: 0 }, { x: Math.cos(radians) * 50, y: Math.sin(radians) * 50 }] })).anchor;
    };
    expect([0, 30, 44, 46, 90, 134, 136, 180, -136, -134, -90, -46, -44].map(heading)).toEqual([
      "start",
      "start",
      "start",
      "middle",
      "middle",
      "middle",
      "end",
      "end",
      "end",
      "middle",
      "middle",
      "middle",
      "start"
    ]);
  });

  it("follows a slice's walk along the ring at its end when it has no labels", () => {
    // d3.pie()'s angles: from 12 o'clock to 3, so the walk ends heading down at 3 o'clock.
    const slice = build.arc({ key: "Saved", cx: 150, cy: 150, inner: 70, outer: 116, start: 0, end: Math.PI / 2 });
    const { at, anchor } = captionPlace(slice);
    expect(anchor).toBe("middle");
    expect(at.x).toBeCloseTo(150 + 93, 9);
    expect(at.y).toBeCloseTo(160 + DOWNWARDS, 9);
  });

  it("goes up from the centre, past the labels there, when the heading meets none of them", () => {
    // A slice from 12 o'clock to 3: its middle at half past one, its label outside the ring there.
    const middle = { x: 150 + 93 * Math.SQRT1_2, y: 150 - 93 * Math.SQRT1_2 };
    const label: Rect = { x: middle.x + 20, y: middle.y - 50, width: 40, height: 34 };
    const slice = build.arc({ key: "Saved", cx: 150, cy: 150, inner: 70, outer: 116, start: 0, end: Math.PI / 2, labelBounds: [label] });
    const { at, anchor, toward } = captionPlace(slice);
    // Outward, at half past one: up and to the right.
    expect(toward).toBeCloseTo(-Math.PI / 4, 9);
    expect(anchor).toBe("middle");
    // The ray leaves the box, grown by 6 px, through its top: 56 px up, and so 56√2 along it.
    const along = 56 * Math.SQRT2;
    expect(at.x).toBeCloseTo(middle.x + along * Math.SQRT1_2, 9);
    expect(at.y).toBeCloseTo(middle.y - along * Math.SQRT1_2 + SIDEWAYS * (1 - Math.SQRT1_2), 9);
    // A label neither way meets leaves it 10 px past the end, along the ring.
    const elsewhere = build.arc({ key: "Saved", cx: 150, cy: 150, inner: 70, outer: 116, start: 0, end: Math.PI / 2, labelBounds: [{ x: 0, y: 0, width: 10, height: 10 }] });
    expect(captionPlace(elsewhere)).toEqual(captionPlace(build.arc({ key: "Saved", cx: 150, cy: 150, inner: 70, outer: 116, start: 0, end: Math.PI / 2 })));
  });

  it("counts a label the heading passes within 6 px of as in the way", () => {
    // 5 px above the bar's line: the text, centred on the line, would reach it.
    const near = { x: 266, y: -1, width: 24, height: 16 };
    expect(captionPlace(bar([near])).at.x).toBe(296);
    // 7 px above: clear.
    const clear = { x: 266, y: -3, width: 24, height: 16 };
    expect(captionPlace(bar([clear])).at.x).toBe(270);
  });

  it("keeps to the heading when it meets a label, whatever the up side meets", () => {
    const value = { x: 266, y: 12, width: 24, height: 14 };
    const overhead = { x: 140, y: -40, width: 40, height: 14 };
    expect(captionPlace(bar([value, overhead]))).toMatchObject({ toward: 0, at: { x: 296 } });
    // A bar whose value label is empty: its name is behind it, and nothing is above it.
    expect(captionPlace(bar([{ x: 0, y: 12, width: 54, height: 14 }]))).toEqual(captionPlace(bar()));
  });
});

describe("captionPlace with other marks' labels near it", () => {
  const value = { x: 266, y: 12, width: 24, height: 14 };
  const near = (labelBounds: Rect[] | undefined, nearbyLabels: Rect[] | undefined): MarkGeometry =>
    build.bar({ key: "Okafor", x: 60, y: 10, width: 200, height: 20, baseline: "left", ...(labelBounds ? { labelBounds } : {}), ...(nearbyLabels ? { nearbyLabels } : {}) });

  it("goes 6 px past another mark's label the heading meets, beside or past its own", () => {
    // Another line's end label just below this one's, reaching further.
    const neighbour = { x: 266, y: 24, width: 60, height: 14 };
    expect(captionPlace(near([value], [neighbour]))).toEqual({ at: { x: 332, y: 20 + SIDEWAYS }, anchor: "start", toward: 0 });
    // With no labels of its own, past the other's.
    expect(captionPlace(near([], [neighbour])).at.x).toBe(332);
    // One nearer than its own label leaves it past its own.
    expect(captionPlace(near([value], [{ x: 262, y: 14, width: 10, height: 10 }])).at.x).toBe(296);
    // One the heading misses by more than 6 px, or one behind the end, changes nothing.
    const below = { x: 266, y: 37, width: 60, height: 14 };
    const behind = { x: 0, y: 12, width: 54, height: 14 };
    expect(captionPlace(near([value], [below, behind]))).toEqual(captionPlace(near([value], undefined)));
    // Unset and empty are the same: none known.
    expect(captionPlace(near([value], []))).toEqual(captionPlace(near([value], undefined)));
  });

  it("goes out from a slice's centre past a neighbour's label that way, as well as its own", () => {
    const middle = { x: 150 + 93 * Math.SQRT1_2, y: 150 - 93 * Math.SQRT1_2 };
    const own: Rect = { x: middle.x + 20, y: middle.y - 50, width: 40, height: 34 };
    // Further out on the way up: the ray leaves it, grown by 6 px, 96 px up and right.
    const neighbour: Rect = { x: middle.x + 60, y: middle.y - 90, width: 40, height: 20 };
    const slice = build.arc({ key: "Saved", cx: 150, cy: 150, inner: 70, outer: 116, start: 0, end: Math.PI / 2, labelBounds: [own], nearbyLabels: [neighbour] });
    const { at, toward } = captionPlace(slice);
    expect(toward).toBeCloseTo(-Math.PI / 4, 9);
    expect(at.x).toBeCloseTo(middle.x + 96, 9);
    expect(at.y).toBeCloseTo(middle.y - 96 + SIDEWAYS * (1 - Math.SQRT1_2), 9);
  });

  it("picks the way from the mark's own labels alone, so another mark's label never turns it", () => {
    const arc = (labelBounds?: Rect[], nearbyLabels?: Rect[]): MarkGeometry =>
      build.arc({ key: "Saved", cx: 150, cy: 150, inner: 70, outer: 116, start: 0, end: Math.PI / 2, ...(labelBounds ? { labelBounds } : {}), ...(nearbyLabels ? { nearbyLabels } : {}) });
    const middle = { x: 150 + 93 * Math.SQRT1_2, y: 150 - 93 * Math.SQRT1_2 };
    const outside: Rect = { x: middle.x + 20, y: middle.y - 50, width: 40, height: 34 };
    // A label on the slice's heading, below 3 o'clock: its own label still sends it out from the centre.
    const onHeading: Rect = { x: 233, y: 170, width: 20, height: 20 };
    expect(captionPlace(arc([outside], [onHeading]))).toEqual(captionPlace(arc([outside])));
    // A slice with no label of its own keeps to its heading along the ring, though a neighbour's label is on its up side, and goes past one on its heading.
    expect(captionPlace(arc([], [outside]))).toEqual(captionPlace(arc()));
    const past = captionPlace(arc([], [onHeading]));
    expect(past.toward).toBeCloseTo(Math.PI / 2, 9);
    expect(past.at.y).toBeCloseTo(196 + DOWNWARDS, 9);
    // A bar whose heading meets none of its own labels keeps to it, though another mark's label is on its up side.
    const overhead = { x: 140, y: -40, width: 40, height: 14 };
    expect(captionPlace(near([{ x: 0, y: 12, width: 54, height: 14 }], [overhead]))).toMatchObject({ toward: 0, at: { x: 270 } });
  });
});

describe("captionPlace with other effects' text, and its own box (texts)", () => {
  const value = { x: 266, y: 12, width: 24, height: 14 };
  /** What the context's `texts` tells a caption: the boxes held before it, and its own text's box, estimated as in jsdom. */
  const text = (held: Rect[] = [], content = "+2"): CaptionText => ({ held, box: (style) => estimatedBox(content, style) });
  const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  const boxOf = (place: CaptionPlace, content = "+2"): Rect => estimatedBox(content, place);
  const nearby = (nearbyLabels: Rect[]): MarkGeometry => build.bar({ key: "Okafor", x: 60, y: 10, width: 200, height: 20, baseline: "left", nearbyLabels });

  it("goes 6 px past the farthest held box its way meets, as past a label, along a heading", () => {
    expect(captionPlace(bar(), text([value]))).toEqual({ at: { x: 296, y: 20 + SIDEWAYS }, anchor: "start", toward: 0 });
    // Past its own label, then past the change held beyond it.
    expect(captionPlace(bar([value]), text([{ x: 300, y: 18, width: 40, height: 14 }])).at.x).toBe(346);
    // Without texts, no other text is known.
    expect(captionPlace(bar(), undefined).at.x).toBe(270);
  });

  it("goes out from a slice's centre past a held box that way, as past a neighbour's label", () => {
    const middle = { x: 150 + 93 * Math.SQRT1_2, y: 150 - 93 * Math.SQRT1_2 };
    const own: Rect = { x: middle.x + 20, y: middle.y - 50, width: 40, height: 34 };
    const held: Rect = { x: middle.x + 60, y: middle.y - 90, width: 40, height: 20 };
    const slice = build.arc({ key: "Saved", cx: 150, cy: 150, inner: 70, outer: 116, start: 0, end: Math.PI / 2, labelBounds: [own] });
    const withNeighbour = build.arc({ key: "Saved", cx: 150, cy: 150, inner: 70, outer: 116, start: 0, end: Math.PI / 2, labelBounds: [own], nearbyLabels: [held] });
    expect(captionPlace(slice, text([held]))).toEqual(captionPlace(withNeighbour));
    expect(captionPlace(slice, text([held])).at.x).toBeCloseTo(middle.x + 96, 9);
  });

  it("moves on until its own box is 6 px clear of a box its way misses but its text would meet", () => {
    // 7 px below the bar's line, and 7 px above it: the line misses both by more than 6 px, but the text, centred on the line, reaches them.
    for (const beside of [{ x: 266, y: 27, width: 24, height: 14 }, { x: 266, y: -3, width: 24, height: 16 }]) {
      expect(captionPlace(bar([beside])).at.x).toBe(270);
      const place = captionPlace(bar([beside]), text());
      // Its box starts 6 px past the label's: the box reaches 0.16 em before the text.
      expect(place.at.x).toBeCloseTo(290 + 6 + 0.16 * 12.5, 9);
      expect(boxOf(place).x).toBeCloseTo(beside.x + beside.width + 6, 9);
    }
    // A longer text reaches further from its point, and goes no further: its box starts at the same place.
    expect(captionPlace(bar([{ x: 266, y: 27, width: 24, height: 14 }]), text([], "+12.5%")).at.x).toBeCloseTo(298, 9);
  });

  it("stays beside other effects' text in the rows above and below, which it meets only where their boxes overlap", () => {
    // Changes past the names on a slope chart's stacked rows, 17 px apart: their boxes come within 0.75 px of this one's, a line apart.
    const place = captionPlace(bar([value]), text());
    const row = (by: number): Rect => ({ ...boxOf(place), y: boxOf(place).y + by });
    expect(captionPlace(bar([value]), text([row(-17), row(17)]))).toEqual(place);
    // Text that overlaps it still takes it on, past it.
    expect(captionPlace(bar([value]), text([row(-10)])).at.x).toBeGreaterThan(place.at.x);
    // A label a line above still keeps it 6 px clear, as text centred along a ring keeps off a label beside it.
    const labelled = build.bar({ key: "Okafor", series: "goals", x: 60, y: 10, width: 200, height: 20, baseline: "left", labelBounds: [value], nearbyLabels: [row(-17)] });
    expect(captionPlace(labelled, text()).at.x).toBeGreaterThan(place.at.x);
  });

  it("keeps clear of a box its way meets but leaves through its top, while its text still hangs on it", () => {
    // Heading up and right, through the box's corner: the line leaves the box, grown by 6 px, through its top, with the text's foot still on the box.
    const line = (labelBounds: Rect[]): MarkGeometry => build.line({ key: "goals", points: [{ x: 0, y: 100 }, { x: 100, y: 100 - 100 * Math.tan(0.3) }], labelBounds });
    const box = { x: 106, y: 68, width: 60, height: 14 };
    expect(overlaps(boxOf(captionPlace(line([box]))), box)).toBe(true);
    const place = captionPlace(line([box]), text());
    expect(place.toward).toBeCloseTo(-0.3, 9);
    // On until its box's foot is on the box's top, clear of it, not 6 px: the way's own 6 px took it this far, as without its box.
    expect(boxOf(place).y + boxOf(place).height).toBeCloseTo(box.y, 9);
    expect(captionPlace(line([box]), text()).at.x).toBeGreaterThan(captionPlace(line([box])).at.x);
  });

  it("doesn't go past a box it would only meet further along its way", () => {
    // On the bar's line, 140 px past its end: the text is clear of it where it is.
    const ahead = { x: 400, y: 12, width: 24, height: 14 };
    expect(captionPlace(bar(), text([ahead])).at.x).toBe(270);
    expect(captionPlace(nearby([ahead]), text()).at.x).toBe(270);
    // Without texts it goes past it, as before.
    expect(captionPlace(nearby([ahead])).at.x).toBe(430);
    // Its own labels are passed wherever the way meets them, as before: they pick its way.
    expect(captionPlace(bar([ahead]), text()).at.x).toBe(430);
  });

  it("keeps text centred along a ring off a label beside it", () => {
    // A slice from 12 o'clock to 3 with no label: its walk ends heading down at 3 o'clock, its text centred under the end.
    const slice = (nearbyLabels: Rect[]): MarkGeometry => build.arc({ key: "Woodwork", cx: 150, cy: 150, inner: 70, outer: 116, start: 0, end: Math.PI / 2, labelBounds: [], nearbyLabels });
    // A neighbour's label 12 px to the right of the way: the line misses it, but centred text 49 px wide reaches it.
    const beside = { x: 255, y: 158, width: 40, height: 16 };
    const before = captionPlace(slice([beside]));
    expect(before.at.y).toBeCloseTo(160 + DOWNWARDS, 9);
    expect(overlaps(boxOf(before, "+12.5%"), beside)).toBe(true);
    const place = captionPlace(slice([beside]), text([], "+12.5%"));
    expect(place.anchor).toBe("middle");
    expect(place.at.x).toBeCloseTo(243, 9);
    // Down until its box's top is 6 px below the label.
    expect(boxOf(place, "+12.5%").y).toBeCloseTo(beside.y + beside.height + 6, 9);
  });

  it("places text as without texts where nothing is near: the fixtures, and bars past their own labels", () => {
    for (const [name, mark] of Object.entries(fixtures)) expect(captionPlace(mark, text()), name).toEqual(captionPlace(mark));
    for (const labels of [[value], [{ x: 0, y: 12, width: 54, height: 14 }, value], [value, { x: 300, y: 18, width: 40, height: 14 }]]) {
      expect(captionPlace(bar(labels), text())).toEqual(captionPlace(bar(labels)));
    }
  });
});
