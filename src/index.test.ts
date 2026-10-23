import { barChart, colorAssignment, donutChart, expressive, motion, motionSwitch, playback, playButton, registerPreset, travel } from "./index";

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
});

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
