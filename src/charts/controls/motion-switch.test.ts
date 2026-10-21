import { createMotion, type MotionMode, type ReducedMotionSource } from "../../core";
import { motionSwitch } from "./motion-switch";

/** A device whose reduced-motion setting the test can flip. */
function device(initial = false): ReducedMotionSource & { set(matches: boolean): void } {
  let matches = initial;
  const listeners = new Set<() => void>();
  return {
    get matches() {
      return matches;
    },
    set(next) {
      matches = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

function setup(options: { mode?: MotionMode; reduced?: boolean } = {}) {
  const reduced = device(options.reduced);
  const motion = createMotion({ mode: options.mode, reducedMotion: reduced });
  const target = document.body.appendChild(document.createElement("div"));
  return { motion, reduced, target };
}

const buttons = (root: Element): HTMLButtonElement[] => Array.from(root.querySelectorAll("button"));
const pressed = (root: Element): string[] => buttons(root).filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.textContent ?? "");
const hint = (root: Element): string => root.querySelector(".ec-motion-hint")?.textContent ?? "";
const button = (root: Element, text: string): HTMLButtonElement => buttons(root).find((b) => b.textContent === text)!;

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("motionSwitch", () => {
  it("builds a labelled group of real toggle buttons in the target, with a note on the mode", () => {
    const { motion, target } = setup();
    const { element } = motionSwitch(target, motion);
    expect(element.parentElement).toBe(target);
    expect(element.getAttribute("role")).toBe("group");
    const label = document.getElementById(element.getAttribute("aria-labelledby")!);
    expect(label?.textContent).toBe("Motion");
    const note = document.getElementById(element.getAttribute("aria-describedby")!);
    expect(note).toBe(element.querySelector(".ec-motion-hint"));
    expect(note?.getAttribute("aria-live")).toBe("polite");

    expect(buttons(element).map((b) => [b.type, b.textContent, b.getAttribute("aria-pressed")])).toEqual([
      ["button", "Presentation", "true"],
      ["button", "Analysis", "false"],
      ["button", "Off", "false"]
    ]);
    expect(hint(element)).toBe("Staged, unhurried motion. Best for walking someone through a change.");
  });

  it("finds its target by selector, and gives every switch its own ids", () => {
    const { motion, target } = setup();
    target.id = "controls";
    const first = motionSwitch("#controls", motion).element;
    const second = motionSwitch(target, motion).element;
    expect(first.parentElement).toBe(target);
    expect(first.getAttribute("aria-labelledby")).not.toBe(second.getAttribute("aria-labelledby"));
    expect(first.getAttribute("aria-describedby")).not.toBe(second.getAttribute("aria-describedby"));
  });

  it("makes a click the viewer's choice, and shows it", () => {
    const { motion, target } = setup();
    const { element } = motionSwitch(target, motion);
    button(element, "Analysis").click();
    expect(motion.viewerChoice).toBe("analysis");
    expect(pressed(element)).toEqual(["Analysis"]);
    expect(hint(element)).toBe("Quick, unstaged motion. Best for exploring.");
    button(element, "Off").click();
    expect(motion.mode).toBe("off");
    expect(pressed(element)).toEqual(["Off"]);
    expect(hint(element)).toBe("No motion: charts jump straight to their end state.");
  });

  it("shows Off and says why while the device asks for reduced motion, until the viewer picks a mode", () => {
    const { motion, target } = setup({ reduced: true });
    const { element } = motionSwitch(target, motion);
    expect(pressed(element)).toEqual(["Off"]);
    expect(hint(element)).toBe("Your device asks for reduced motion, so motion is off. Picking a mode here overrides it.");

    // The viewer's choice overrides the device; the author's mode never does.
    button(element, "Presentation").click();
    expect(motion.mode).toBe("presentation");
    expect(pressed(element)).toEqual(["Presentation"]);
    expect(hint(element)).toMatch(/^Staged/);

    // Picking Off is a choice too, so the note no longer blames the device.
    button(element, "Off").click();
    expect(hint(element)).toMatch(/^No motion/);
  });

  it("follows the motion, whoever changes it: the author, the device or another control", () => {
    const { motion, reduced, target } = setup();
    const { element } = motionSwitch(target, motion);
    motion.setMode("analysis");
    expect(pressed(element)).toEqual(["Analysis"]);
    reduced.set(true);
    expect(pressed(element)).toEqual(["Off"]);
    expect(hint(element)).toMatch(/^Your device asks for reduced motion/);
    motion.chooseMode("presentation");
    expect(pressed(element)).toEqual(["Presentation"]);
    motion.clearChoice();
    expect(pressed(element)).toEqual(["Off"]);
    reduced.set(false);
    expect(pressed(element)).toEqual(["Analysis"]);
  });

  it("takes its own label, button text and notes", () => {
    const { motion, target } = setup({ reduced: true });
    const { element } = motionSwitch(target, motion, {
      label: "Animation",
      labels: { presentation: "Present", analysis: "Analyse" },
      hints: { reduced: "Reduced motion is on.", analysis: "Fast." }
    });
    expect(element.querySelector(".ec-motion-label")?.textContent).toBe("Animation");
    expect(buttons(element).map((b) => b.textContent)).toEqual(["Present", "Analyse", "Off"]);
    expect(hint(element)).toBe("Reduced motion is on.");
    button(element, "Analyse").click();
    expect(hint(element)).toBe("Fast.");
  });

  it("removes itself on destroy, keeping the viewer's choice, and stops following the motion", () => {
    const { motion, target } = setup();
    const control = motionSwitch(target, motion);
    button(control.element, "Analysis").click();
    control.destroy();
    control.destroy();
    expect(target.childElementCount).toBe(0);
    expect(motion.viewerChoice).toBe("analysis");
    motion.chooseMode("off");
    expect(pressed(control.element)).toEqual(["Analysis"]);
  });

  describe("persist", () => {
    it("is off by default: nothing is stored", () => {
      const { motion, target } = setup();
      button(motionSwitch(target, motion).element, "Off").click();
      expect(localStorage.length).toBe(0);
    });

    it("saves the viewer's choice under the key, and restores it the next time", () => {
      const first = setup();
      button(motionSwitch(first.target, first.motion, { persist: "demo-motion" }).element, "Analysis").click();
      expect(localStorage.getItem("demo-motion")).toBe("analysis");

      // A new page: the stored choice is the viewer's, so it overrides reduced motion too.
      const next = setup({ reduced: true });
      const { element } = motionSwitch(next.target, next.motion, { persist: "demo-motion" });
      expect(next.motion.viewerChoice).toBe("analysis");
      expect(pressed(element)).toEqual(["Analysis"]);

      // Forgetting the choice forgets it in storage too.
      next.motion.clearChoice();
      expect(localStorage.getItem("demo-motion")).toBeNull();
      expect(pressed(element)).toEqual(["Off"]);
    });

    it("ignores a stored value that isn't a mode", () => {
      localStorage.setItem("demo-motion", "warp");
      const { motion, target } = setup();
      motionSwitch(target, motion, { persist: "demo-motion" });
      expect(motion.viewerChoice).toBeUndefined();
    });

    it("carries on when storage is blocked or full", () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new DOMException("blocked", "SecurityError");
      });
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new DOMException("full", "QuotaExceededError");
      });
      const { motion, target } = setup();
      const { element } = motionSwitch(target, motion, { persist: "demo-motion" });
      button(element, "Off").click();
      expect(motion.mode).toBe("off");
      expect(pressed(element)).toEqual(["Off"]);
    });
  });

  it("checks what it's given", () => {
    const { motion, target } = setup();
    expect(() => motionSwitch("#nowhere", motion)).toThrow(/no element matches "#nowhere"/);
    expect(() => motionSwitch(42 as unknown as Element, motion)).toThrow(TypeError);
    expect(() => motionSwitch(target, {} as typeof motion)).toThrow(/needs a Motion/);
    expect(() => motionSwitch(target, motion, { persist: "" })).toThrow(/persist/);
    expect(() => motionSwitch(target, motion, { labels: { off: 3 as unknown as string } })).toThrow(/labels.off/);
    expect(target.childElementCount).toBe(0);
  });
});
