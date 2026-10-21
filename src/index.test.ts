import { barChart, colorAssignment, expressive, registerPreset, travel, VERSION } from "./index";

describe("expressive-charts", () => {
  it("exposes a version", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

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
