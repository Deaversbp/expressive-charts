import { barChart, colorAssignment, registerPreset, VERSION } from "./index";

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
