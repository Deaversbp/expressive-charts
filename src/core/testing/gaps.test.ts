import type { Icon } from "../contracts/icon";
import { describe as build, matrix } from "../index";
import { drawnInGaps } from "./gaps";
import { recordingLayer } from "./recording";

const flag: Icon = {
  name: "flag",
  shapes: [{ d: "M5,0A5,5 0 0 1 -5,0A5,5 0 0 1 5,0Z", fill: "#ffffff" }],
  box: { x: -5, y: -5, width: 10, height: 10 },
  size: 10,
  anchor: { x: 0, y: 0 },
  pivot: { x: 0, y: 0 },
  footprint: [5, 5]
};

// Level runs from x = 0 to 100 and 200 to 300, with a 100 px gap between.
const line = build.line({ key: "goals", points: [0, 100, 200, 300].map((x) => ({ x, y: 50 })), breaks: [2], width: 2 });

describe("drawnInGaps", () => {
  it("finds a path that runs along a gap, and none that leaves it out", () => {
    const layer = recordingLayer();
    layer.path(line.slice(0, 1), {});
    layer.path("M0,50L300,50", {});
    layer.path("M150,40L150,60", {});
    layer.path("M190,50L210,50", {});
    expect(drawnInGaps(line, layer.drawn)).toEqual(['the path "M0,50L300,50" runs along gap 1', 'the path "M190,50L210,50" runs along gap 1']);
  });

  it("finds an icon carried through a gap, but not one resting at its end, or far from the walk", () => {
    const layer = recordingLayer();
    for (const x of [105, 150, 195, 205]) layer.icon(flag).place(matrix.translate(x, 44));
    layer.icon(flag).place(matrix.translate(150, 10));
    expect(drawnInGaps(line, layer.drawn)).toEqual(["the icon flag at 150,44 is over gap 1"]);
  });

  it("finds text on a gap", () => {
    const layer = recordingLayer();
    layer.text("+1", { at: { x: 150, y: 45 } });
    layer.text("+2", { at: { x: 310, y: 45 } });
    expect(drawnInGaps(line, layer.drawn)).toEqual(['the text "+1" at 150,45 is over gap 1']);
  });

  it("finds nothing on a mark with no gaps", () => {
    const layer = recordingLayer();
    layer.path("M0,50L300,50", {});
    expect(drawnInGaps(build.line({ key: "goals", points: [0, 300].map((x) => ({ x, y: 50 })) }), layer.drawn)).toEqual([]);
  });
});
