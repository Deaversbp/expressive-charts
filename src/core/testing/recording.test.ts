import type { Icon } from "../contracts/icon";
import { recordingLayer, recordingMark, type DrawnPath } from "./recording";

const dot: Icon = {
  name: "dot",
  shapes: [{ d: "M0,-4A4,4 0 0 1 0,4A4,4 0 0 1 0,-4Z", fill: "mark" }],
  box: { x: -4, y: -4, width: 8, height: 8 },
  size: 8,
  anchor: { x: 0, y: 0 },
  pivot: { x: 0, y: 0 },
  footprint: [4, 4]
};

describe("recordingLayer", () => {
  it("records icons, hidden until placed", () => {
    const layer = recordingLayer();
    const icon = layer.icon(dot, { size: 12 });
    expect(layer.drawn).toEqual([{ kind: "icon", id: 1, icon: dot, size: 12, transform: undefined }]);
    icon.place([1, 0, 0, 1, 5, 6]);
    expect(layer.drawn[0]).toMatchObject({ transform: [1, 0, 0, 1, 5, 6] });
    icon.remove();
    expect(layer.drawn).toEqual([]);
  });

  it("records paths and merges paint on update", () => {
    const layer = recordingLayer();
    const path = layer.path("M0,0", { stroke: "mark", width: 3, opacity: 0.5 });
    path.update("M0,0L10,0", { opacity: 1 });
    expect(layer.drawn).toEqual([{ kind: "path", id: 1, d: "M0,0L10,0", paint: { stroke: "mark", width: 3, opacity: 1 } }]);
    path.update("M0,0L20,0", { width: undefined });
    expect(layer.drawn[0]).toEqual({ kind: "path", id: 1, d: "M0,0L20,0", paint: { stroke: "mark", opacity: 1 } });
  });

  it("keeps a paint's part in its calls, what's drawn and its picture, and an update to undefined takes it off", () => {
    const layer = recordingLayer();
    const paint = { stroke: "mark", width: 20, linecap: "butt", part: "Okafor/assists" } as const;
    const path = layer.path("M0,0", paint);
    expect(layer.calls).toEqual([{ op: "path", id: 1, d: "M0,0", paint }]);
    path.update("M0,0L10,0");
    expect(layer.picture()).toEqual([{ kind: "path", d: "M0,0L10,0", paint }]);
    path.update("M0,0L20,0", { part: undefined });
    expect(layer.calls[2]).toEqual({ op: "update-path", id: 1, d: "M0,0L20,0", paint: { part: undefined } });
    const { part, ...rest } = paint;
    expect(part).toBe("Okafor/assists");
    expect(Object.keys((layer.drawn[0] as DrawnPath).paint)).toEqual(Object.keys(rest));
  });

  it("records text and merges style on update", () => {
    const layer = recordingLayer();
    const text = layer.text("+2", { at: { x: 1, y: 2 }, anchor: "start", opacity: 0 });
    text.update({ opacity: 1 });
    text.update({ at: { x: 3, y: 4 } }, "+3");
    expect(layer.drawn).toEqual([{ kind: "text", id: 1, content: "+3", style: { at: { x: 3, y: 4 }, anchor: "start", opacity: 1 } }]);
  });

  it("logs every call, and ignores calls on removed handles", () => {
    const layer = recordingLayer();
    const path = layer.path("M0,0", { stroke: "mark" });
    path.remove();
    path.update("M1,1");
    expect(layer.drawn).toEqual([]);
    expect(layer.calls.map((c) => c.op)).toEqual(["path", "remove", "update-path"]);
  });

  it("keeps creation order, and empties on clear()", () => {
    const layer = recordingLayer();
    layer.path("M0,0", {});
    layer.icon(dot);
    layer.text("a", { at: { x: 0, y: 0 } });
    expect(layer.drawn.map((d) => d.kind)).toEqual(["path", "icon", "text"]);
    layer.clear();
    expect(layer.drawn).toEqual([]);
    expect(layer.calls[layer.calls.length - 1]).toEqual({ op: "clear" });
  });

  it("gives a picture without ids, rounded, for comparing a run with end()", () => {
    const a = recordingLayer();
    a.icon(dot).place([1, 0, 0, 1, 10.00000000001, -0.0000000001]);
    a.text("+2", { at: { x: 1 / 3, y: 2 }, opacity: 0.99999999 });
    const b = recordingLayer();
    b.path("M0,0", {}).remove();
    b.icon(dot).place([1, 0, 0, 1, 10, 0]);
    b.text("+2", { at: { x: 0.333, y: 2 }, opacity: 1 });
    expect(a.picture()).toEqual(b.picture());
    expect(a.picture()).toEqual([
      { kind: "icon", icon: "dot", size: undefined, transform: [1, 0, 0, 1, 10, 0] },
      { kind: "text", content: "+2", style: { at: { x: 0.333, y: 2 }, opacity: 1 } }
    ]);
  });
});

describe("recordingMark", () => {
  it("merges set() calls so parallel effects don't undo each other", () => {
    const mark = recordingMark();
    mark.set({ transform: [1, 0, 0, 1, 0, 2] });
    mark.set({ halo: { width: 4, opacity: 0.5 } });
    expect(mark.style).toEqual({ transform: [1, 0, 0, 1, 0, 2], halo: { width: 4, opacity: 0.5 } });
    mark.set({ transform: undefined });
    expect(mark.style).toEqual({ halo: { width: 4, opacity: 0.5 } });
  });

  it("goes back to the mark's own style on reset()", () => {
    const mark = recordingMark();
    mark.set({ opacity: 0.3, emphasis: 1 });
    mark.reset();
    expect(mark.style).toEqual({});
    expect(mark.calls).toEqual([{ op: "set", style: { opacity: 0.3, emphasis: 1 } }, { op: "reset" }]);
  });
});
