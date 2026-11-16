import { barChart, colorAssignment, createMotion, donutChart, expressive, motion, motionSwitch, playback, playButton, registerPreset, travel, type Motion, type MotionSwitchOptions } from "./index";

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
  /** What main (3720f29) built for `(target)`, `(target, motion)`, `(target, motion, options)` and `(target, undefined, options)`. */
  const MAIN = { page: "b534721dbb978f8f", own: "98ed2bdc7279eb5e", ownWithOptions: "80bdc1a04b47d514", pageWithOptions: "8c18845665367f51" };

  it("takes its options second, the motion among them, and builds what main built", () => {
    expect(built((target) => motionSwitch(target))).toBe(MAIN.page);
    expect(built((target) => motionSwitch(target, {}))).toBe(MAIN.page);
    expect(built((target) => motionSwitch(target, undefined))).toBe(MAIN.page);
    expect(built((target) => motionSwitch(target, more))).toBe(MAIN.pageWithOptions);
    expect(built((target) => motionSwitch(target, { motion: own() }))).toBe(MAIN.own);
    expect(built((target) => motionSwitch(target, { ...more, motion: own() }))).toBe(MAIN.ownWithOptions);
    expect(built((target) => motionSwitch(target, { ...more, motion: undefined }))).toBe(MAIN.pageWithOptions);
  });

  it("still takes the form before 0.13.0, a motion second and options third, and builds the same", () => {
    expect(built((target) => motionSwitch(target, own()))).toBe(MAIN.own);
    expect(built((target) => motionSwitch(target, own(), more))).toBe(MAIN.ownWithOptions);
    expect(built((target) => motionSwitch(target, undefined, more))).toBe(MAIN.pageWithOptions);
    expect(built((target) => motionSwitch(target, motion))).toBe(MAIN.page);
    // The second argument is the old form's motion, over one among its options.
    expect(built((target) => motionSwitch(target, own(), { ...more, motion }))).toBe(MAIN.ownWithOptions);
    expect(built((target) => motionSwitch(target, undefined, { ...more, motion: own() }))).toBe(MAIN.ownWithOptions);
  });

  it("sets the motion it was given, in either form, and leaves the page-wide one alone", () => {
    for (const make of [(target: Element, mine: Motion) => motionSwitch(target, { motion: mine }), (target: Element, mine: Motion) => motionSwitch(target, mine)]) {
      const mine = own();
      const control = make(document.body.appendChild(document.createElement("div")), mine);
      control.element.querySelector<HTMLButtonElement>('button[data-mode="off"]')!.click();
      expect(mine.viewerChoice).toBe("off");
      expect(motion.viewerChoice).toBeUndefined();
      control.destroy();
    }
  });

  it("throws a TypeError for a second argument that is neither options nor a motion, and for a motion that isn't one", () => {
    const target = document.body.appendChild(document.createElement("div"));
    for (const second of [42, "analysis", null, true]) {
      expect(() => motionSwitch(target, second as unknown as Motion)).toThrow(TypeError);
      expect(() => motionSwitch(target, second as unknown as Motion)).toThrow(/needs a Motion/);
    }
    expect(() => motionSwitch(target, { motion: {} as Motion })).toThrow(/needs a Motion/);
    expect(() => motionSwitch(target, { chooseMode: 1 } as unknown as Motion)).toThrow(/needs a Motion/);
    expect(() => motionSwitch(target, {} as Motion, more)).toThrow(/needs a Motion/);
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
