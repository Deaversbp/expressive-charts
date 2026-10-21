import { stylesheet } from "./charts/render/theme";
import { barChart, colorAssignment, configure, expressive, registerPreset, travel, VERSION } from "./index";

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

describe("configure: how the stylesheet reaches the page", () => {
  type Row = { region: string; revenue: number };
  const rows: Row[] = [
    { region: "North", revenue: 3 },
    { region: "South", revenue: 5 }
  ];

  /** A page of its own (a frame, whose document parses its stylesheets), with a chart and an adapter on host-drawn rects. */
  function page(head = "") {
    const doc = document.body.appendChild(document.createElement("iframe")).contentDocument!;
    doc.head.innerHTML = head;
    const container = doc.body.appendChild(doc.createElement("div"));
    const chart = barChart(container, { label: "Revenue by region", data: rows, y: "region", x: "revenue", width: 400, motion: "off" });
    const host = doc.body.appendChild(doc.createElementNS("http://www.w3.org/2000/svg", "svg"));
    host.innerHTML = '<rect x="0" y="0" width="120" height="20"/><rect x="0" y="30" width="80" height="20"/>';
    const rects = Array.from(host.querySelectorAll("rect"));
    rects.forEach((rect, i) => Object.assign(rect, { __data__: rows[i] }));
    const fx = expressive<Row>(rects, { key: (d) => d.region, keyboard: true, dim: true, motion: "off" });
    const injected = () => doc.querySelectorAll("style[data-expressive-charts]");
    /** Every CSS rule in effect on the page, in order. */
    const css = () => Array.from(doc.styleSheets).flatMap((sheet) => Array.from(sheet.cssRules, (rule) => rule.cssText));
    return { doc, chart, host, fx, injected, css };
  }

  afterEach(() => configure({ nonce: undefined, injectStyles: undefined }));

  it("injects one stylesheet per page by default, for charts and adapters alike", () => {
    const { injected, chart, fx, doc } = page();
    expect(injected()).toHaveLength(1);
    expect(injected()[0]!.hasAttribute("nonce")).toBe(false);
    chart.destroy();
    fx.destroy();
    // Shared, so it stays.
    expect(injected()).toHaveLength(1);

    // An adapter alone injects it too: the overlay and the focus ring draw in theme tokens.
    const other = document.body.appendChild(document.createElement("iframe")).contentDocument!;
    const svg = other.body.appendChild(other.createElementNS("http://www.w3.org/2000/svg", "svg"));
    svg.innerHTML = '<rect x="0" y="0" width="120" height="20"/>';
    expressive(svg.querySelectorAll("rect"), { key: () => "North", datum: () => rows[0]! }).destroy();
    expect(other.querySelectorAll("style[data-expressive-charts]")).toHaveLength(1);
    expect(doc).not.toBe(other);
  });

  it("puts the nonce on the injected <style>", () => {
    configure({ nonce: "r4nd0m" });
    const { injected } = page();
    expect(injected()).toHaveLength(1);
    expect(injected()[0]!.getAttribute("nonce")).toBe("r4nd0m");
  });

  it("with injectStyles: false and the CSS file, renders the page as injection does", () => {
    const injecting = page();

    configure({ injectStyles: false });
    // What a bundler or a <link> puts on the page for expressive-charts/style.css: the build writes this text to dist/expressive-charts.css.
    const loading = page(`<style>${stylesheet}</style>`);
    expect(loading.injected()).toHaveLength(0);

    expect(injecting.css().length).toBeGreaterThan(20);
    expect(loading.css()).toEqual(injecting.css());
    expect(loading.chart.element.outerHTML).toBe(injecting.chart.element.outerHTML);
    expect(loading.host.outerHTML).toBe(injecting.host.outerHTML);
  });

  it("keeps options it isn't given, and checks the ones it is", () => {
    configure({ nonce: "r4nd0m" });
    configure({ injectStyles: true });
    expect(page().injected()[0]!.getAttribute("nonce")).toBe("r4nd0m");
    expect(() => configure({ nonce: "" })).toThrow(/nonce must be a non-empty string/);
    expect(() => configure({ injectStyles: "no" as unknown as boolean })).toThrow(/injectStyles must be true or false/);
    expect(() => configure(null as unknown as {})).toThrow(/options object/);
  });
});
