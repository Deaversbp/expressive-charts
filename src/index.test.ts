import { barChart, colorAssignment, createMotion, donutChart, expressive, motion, motionSwitch, playback, playButton, registerPreset, travel, type Motion, type MotionSwitch, type MotionSwitchOptions } from "./index";

// VERSION is checked against package.json's version in package.test.ts.
describe("expressive-charts", () => {
  it("runs tests in a DOM environment", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    expect(svg.namespaceURI).toBe("http://www.w3.org/2000/svg");
  });
});

describe("barChart from the composition root", () => {
  afterEach(() => {
    document.body.textContent = "";
  });

  it("resolves preset names through the page-wide registry", () => {
    const runs: string[] = [];
    registerPreset("test-index-mark", () => ({
      kind: "geometry",
      run: async (mark) => {
        runs.push(mark.key);
      },
      end: () => {},
      clear: () => {}
    }));
    const container = document.body.appendChild(document.createElement("div"));
    const chart = barChart(container, {
      label: "Revenue by region",
      data: [{ region: "North", revenue: 3 }],
      y: "region",
      x: "revenue",
      width: 400,
      colors: colorAssignment({ revenue: 2 }),
      on: { enter: "test-index-mark" }
    });
    expect(runs).toEqual(["North"]);
    expect(chart.marks().map((mark) => mark.key)).toEqual(["North"]);
    expect(() => barChart(container, { label: "Typo", data: [] as { region: string; revenue: number }[], y: "region", x: "revenue", on: { hover: "test-wigle" } })).toThrow(/Unknown preset "test-wigle"/);
    chart.destroy();
  });
});

describe("donutChart from the composition root", () => {
  afterEach(() => {
    document.body.textContent = "";
  });

  it("plays the built-in presets by name on its slices", () => {
    const container = document.body.appendChild(document.createElement("div"));
    const chart = donutChart(container, {
      label: "Shot outcomes",
      data: [
        { outcome: "Goal", shots: 58 },
        { outcome: "Saved", shots: 112 }
      ],
      category: "outcome",
      value: "shots",
      width: 400,
      motion: "off",
      on: { hover: "wiggle", update: "pulse", enter: "flash" }
    });
    expect(chart.marks().map((mark) => mark.key)).toEqual(["Goal", "Saved"]);
    container.querySelector('[data-key="Saved"] .ec-slice')!.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
    // With motion off, a wiggle ends where it started: no transform.
    expect(container.querySelector('[data-key="Saved"] .ec-body')!.getAttribute("transform")).toBeNull();
    expect(() => donutChart(container, { label: "Typo", data: [] as { outcome: string; shots: number }[], category: "outcome", value: "shots", on: { hover: "test-wigle" } })).toThrow(/Unknown preset "test-wigle"/);
    chart.destroy();
  });
});

describe("expressive from the composition root", () => {
  afterEach(() => {
    document.body.textContent = "";
  });

  it("resolves preset and icon names through the page-wide registries", () => {
    const runs: string[] = [];
    registerPreset("test-index-adapter", () => ({
      kind: "geometry",
      run: async (mark) => {
        runs.push(mark.key);
      },
      end: (mark) => {
        runs.push(mark.key);
      },
      clear: () => {}
    }));
    const svg = document.body.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "svg"));
    svg.innerHTML = '<rect x="0" y="0" width="120" height="20"/><rect x="0" y="30" width="80" height="20"/>';
    const rects = Array.from(svg.querySelectorAll("rect"));
    rects.forEach((rect, i) => Object.assign(rect, { __data__: { region: i === 0 ? "North" : "South", revenue: 3 } }));
    // A D3 selection's data() types the callbacks.
    const selection = { nodes: () => rects, data: () => rects.map((r) => (r as unknown as { __data__: { region: string; revenue: number } }).__data__) };
    const fx = expressive(selection, { key: (d) => d.region, motion: "off", on: { enter: "test-index-adapter", decorate: travel("dot") } });
    expect(runs).toEqual(["North", "South"]);
    expect(svg.querySelectorAll('.ec-overlay .ec-icon[data-icon="dot"]')).toHaveLength(2);
    expect(() => expressive(selection, { key: (d) => d.region, on: { hover: "test-wigle" } })).toThrow(/Unknown preset "test-wigle"/);
    fx.destroy();
    expect(svg.querySelector(".ec-overlay")).toBeNull();
  });
});

describe("motionSwitch from the composition root", () => {
  afterEach(() => {
    motion.clearChoice();
    document.body.textContent = "";
  });

  it("switches the page-wide motion by default, which every chart follows", () => {
    const control = motionSwitch(document.body.appendChild(document.createElement("div")));
    control.element.querySelector<HTMLButtonElement>('button[data-mode="analysis"]')!.click();
    expect(motion.viewerChoice).toBe("analysis");
    expect(motion.mode).toBe("analysis");
    control.destroy();
  });

  /** A motion of its own in Analysis, which the page-wide one isn't, so the pressed button says whose the switch is. */
  const own = (): Motion => createMotion({ mode: "analysis", reducedMotion: { matches: false, subscribe: () => () => {} } });
  const more: MotionSwitchOptions = { label: "Animation", labels: { presentation: "Present", analysis: "Analyse" }, hints: { analysis: "Fast." } };
  /** The switch's markup, with the counter in its ids taken out, hashed. */
  const built = (make: (target: Element) => unknown): string => {
    const target = document.body.appendChild(document.createElement("div"));
    make(target);
    return hash(target.innerHTML.replace(/ec-motion-\d+/g, "ec-motion"));
  };
  /**
   * What main (3720f29, 0.12.0's code) built for `(target)`, `(target, motion)`, `(target, motion, options)` and
   * `(target, undefined, options)`. The forms that stay build the same.
   */
  const MAIN = { page: "b534721dbb978f8f", own: "98ed2bdc7279eb5e", ownWithOptions: "80bdc1a04b47d514", pageWithOptions: "8c18845665367f51" };
  /** `motionSwitch` as a page in JavaScript calls it, with any arguments. */
  const untyped = motionSwitch as unknown as (...args: unknown[]) => MotionSwitch;
  const removed = /^Since 1\.0 motionSwitch takes \(target, options\), with the motion among the options: motionSwitch\(target, \{ motion, \.\.\.options \}\)\.$/;

  it("takes its options second, the motion among them, and builds what main built", () => {
    expect(built((target) => motionSwitch(target))).toBe(MAIN.page);
    expect(built((target) => motionSwitch(target, {}))).toBe(MAIN.page);
    expect(built((target) => motionSwitch(target, undefined))).toBe(MAIN.page);
    expect(built((target) => motionSwitch(target, more))).toBe(MAIN.pageWithOptions);
    expect(built((target) => motionSwitch(target, { motion: own() }))).toBe(MAIN.own);
    expect(built((target) => motionSwitch(target, { ...more, motion: own() }))).toBe(MAIN.ownWithOptions);
    expect(built((target) => motionSwitch(target, { ...more, motion: undefined }))).toBe(MAIN.pageWithOptions);
  });

  it("throws a TypeError naming the new form for the form 1.0 took out, a motion second or options third, building nothing", () => {
    const target = document.body.appendChild(document.createElement("div"));
    const calls: unknown[][] = [
      [own()],
      [own(), more],
      [undefined, more],
      [motion],
      [own(), { ...more, motion }],
      [undefined, { ...more, motion: own() }],
      [{}, more],
      [{ chooseMode: 1 }]
    ];
    for (const args of calls) {
      expect(() => untyped(target, ...args)).toThrow(TypeError);
      expect(() => untyped(target, ...args)).toThrow(removed);
    }
    expect(target.childElementCount).toBe(0);
    // A third argument that's undefined is no third argument.
    expect(built((target) => untyped(target, more, undefined))).toBe(MAIN.pageWithOptions);
  });

  it("sets the motion among its options, and leaves the page-wide one alone", () => {
    const mine = own();
    const control = motionSwitch(document.body.appendChild(document.createElement("div")), { motion: mine });
    control.element.querySelector<HTMLButtonElement>('button[data-mode="off"]')!.click();
    expect(mine.viewerChoice).toBe("off");
    expect(motion.viewerChoice).toBeUndefined();
    control.destroy();
  });

  it("throws a TypeError for options that aren't an object, and for a motion that isn't one", () => {
    const target = document.body.appendChild(document.createElement("div"));
    for (const second of [42, "analysis", null, true]) {
      expect(() => untyped(target, second)).toThrow(TypeError);
      expect(() => untyped(target, second)).toThrow(/^motionSwitch: options must be an object, got (number|string|null|boolean)\.$/);
    }
    expect(() => motionSwitch(target, { motion: {} as Motion })).toThrow(/needs a Motion/);
    expect(() => motionSwitch(target, { persist: "" })).toThrow(/persist/);
    expect(target.childElementCount).toBe(0);
  });
});

/** A 64-bit hash of the text (cyrb53's mixing, both halves kept), as 16 hex digits. */
function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}

describe("playback and playButton from the composition root", () => {
  afterEach(() => {
    motion.clearChoice();
    document.body.textContent = "";
  });

  it("follow the page-wide motion by default: with Off chosen, Play shows the end at once", () => {
    motion.chooseMode("off");
    const weeks: number[] = [];
    const season = playback({ from: 1, to: 38, duration: 6500, onFrame: (week) => weeks.push(week) });
    season.seek(10, { animate: false });
    const control = playButton(document.body.appendChild(document.createElement("div")), season, { labels: { play: "Play season" } });
    control.element.click();
    expect(weeks).toEqual([10, 38]);
    expect(control.element.textContent).toBe("Play season");
    control.destroy();
    season.destroy();
  });
});
