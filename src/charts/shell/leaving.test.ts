import { flush } from "../../core/testing";
import { svgElement } from "../render/svg";
import { leavingMarks, type LeavingMark } from "./leaving";

interface Mark extends LeavingMark {
  fading: boolean;
}

function mark(key: string, layer: SVGGElement): Mark {
  return { key, group: svgElement("g", { class: "ec-mark" }, layer), leave: undefined, fading: false };
}

describe("leavingMarks", () => {
  const layer = svgElement("g");

  it("hides a leaving mark from screen readers, and removes it once it's exited and done fading", async () => {
    const leaving = leavingMarks<Mark>((record) => record.fading);
    const a = mark("a", layer);
    leaving.start(a);
    expect(a.group.getAttribute("aria-hidden")).toBe("true");
    expect(a.group.classList.contains("ec-leaving")).toBe(true);
    const leave = a.leave!;
    let gone = false;
    void leave.gone.then(() => (gone = true));

    a.fading = true;
    leave.exited = true;
    leaving.sweep();
    expect(leaving.get("a")).toBe(a);

    a.fading = false;
    leaving.sweep();
    await flush();
    expect(leaving.get("a")).toBeUndefined();
    expect(a.group.isConnected).toBe(false);
    expect(a.leave).toBeUndefined();
    expect(gone).toBe(true);
  });

  it("keeps a mark whose exit effects aren't done", () => {
    const leaving = leavingMarks<Mark>((record) => record.fading);
    const a = mark("a", layer);
    leaving.start(a);
    leaving.sweep();
    expect([...leaving.values()]).toEqual([a]);
  });

  it("brings a mark back with its element, and a fresh departure if it leaves again", async () => {
    const leaving = leavingMarks<Mark>((record) => record.fading);
    const a = mark("a", layer);
    leaving.start(a);
    const first = a.leave!;
    let resolved = false;
    void first.gone.then(() => (resolved = true));

    expect(leaving.recall("a")).toBe(a);
    expect(leaving.recall("b")).toBeUndefined();
    await flush();
    expect(resolved).toBe(true);
    expect(a.group.hasAttribute("aria-hidden")).toBe(false);
    expect(a.group.classList.contains("ec-leaving")).toBe(false);
    expect(a.leave).toBeUndefined();

    leaving.start(a);
    expect(a.leave).not.toBe(first);
    expect(a.leave!.exited).toBe(false);
  });
});
