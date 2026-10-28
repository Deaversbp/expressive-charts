import { createMotion, manualClock, matrix, type EffectContext, type GeometryEffect, type Icon, type MarkGeometry } from "../../core";
import { createRegistry, type PresetFactory } from "../../core/registry";
import { barChart } from "../bar";
import { donutChart } from "../donut";
import type { ChartEnv } from "../shell/setup";
import { svgMarkHandle, type StyledPart, type StyleTarget } from "./mark-style";
import { svgElement } from "./svg";
import { seriesColors, stylesheet } from "./theme";

function setup() {
  const body = svgElement("g", { class: "ec-body" }, svgElement("svg", {}, document.body));
  const part = (d: string, slot: number, visible = true): StyledPart => ({
    element: svgElement("path", { class: "ec-segment", d }, body),
    d,
    colors: seriesColors(slot),
    visible
  });
  const target: { current: StyleTarget } = { current: { body, parts: [part("M0,0L10,0L10,20Z", 1), part("M12,0L20,0L20,20Z", 4)] } };
  return { body, part, target, handle: svgMarkHandle(() => target.current) };
}

afterEach(() => {
  document.body.textContent = "";
});

describe("svgMarkHandle", () => {
  it("moves and fades the body, not the labels", () => {
    const { body, handle } = setup();
    handle.set({ transform: matrix.rotate(Math.PI / 180, { x: 0, y: 10 }), opacity: 0.5 });
    expect(body.getAttribute("transform")).toBe("matrix(0.999848 0.017452 -0.017452 0.999848 0.175 0.002)");
    expect(body.getAttribute("opacity")).toBe("0.5");
    handle.set({ transform: undefined });
    expect(body.getAttribute("transform")).toBeNull();
    expect(body.getAttribute("opacity")).toBe("0.5");
  });

  it("mixes each part toward its strong colour, without the CSS hover transition", () => {
    const { target, handle } = setup();
    const [goals, assists] = target.current.parts;
    handle.set({ emphasis: 1 });
    expect(goals!.element.style.getPropertyValue("fill")).toBe("var(--ec-series-1-strong, #1c5cab)");
    expect(goals!.element.style.getPropertyValue("transition")).toBe("none");
    handle.set({ emphasis: 0.25 });
    expect(assists!.element.style.getPropertyValue("fill")).toBe(
      "color-mix(in srgb, var(--ec-series-4-strong, #9d6a07) 25%, var(--ec-series-4, #c28409))"
    );
    handle.set({ emphasis: undefined });
    expect(goals!.element.style.getPropertyValue("fill")).toBe("");
    expect(goals!.element.style.getPropertyValue("transition")).toBe("");
  });

  it("draws a halo behind the visible parts, in each part's colour unless given one", () => {
    const { body, part, target, handle } = setup();
    target.current = { body, parts: [...target.current.parts, part("M20,0L20,20Z", 2, false)] };
    handle.set({ halo: { width: 8, opacity: 0.35 } });
    const halo = body.firstElementChild as SVGGElement;
    expect(halo.getAttribute("class")).toBe("ec-halo");
    const paths = Array.from(halo.children) as SVGPathElement[];
    expect(paths.map((p) => p.getAttribute("d"))).toEqual(["M0,0L10,0L10,20Z", "M12,0L20,0L20,20Z"]);
    expect(paths[0]!.getAttribute("stroke-width")).toBe("8");
    expect(paths[0]!.getAttribute("stroke-opacity")).toBe("0.35");
    expect(paths[0]!.style.getPropertyValue("fill")).toBe("none");
    expect(paths[1]!.style.getPropertyValue("stroke")).toBe("var(--ec-series-4, #c28409)");
    handle.set({ halo: { width: 4, opacity: 1, color: "negative" } });
    expect(halo.children).toHaveLength(2);
    expect((halo.children[0] as SVGPathElement).style.getPropertyValue("stroke")).toBe("var(--ec-negative, #d03b3b)");
    handle.set({ halo: undefined });
    expect(body.querySelector(".ec-halo")).toBeNull();
  });

  it("mixes an open part's stroke, not its fill", () => {
    const { body, target, handle } = setup();
    const line: StyledPart = { element: svgElement("path", { class: "ec-stroke", d: "M0,20L10,5L20,12" }, body), d: "M0,20L10,5L20,12", colors: seriesColors(2), visible: true, open: { width: 2.25 } };
    target.current = { body, parts: [line] };
    handle.set({ emphasis: 1 });
    expect(line.element.style.getPropertyValue("stroke")).toBe(seriesColors(2).strong);
    expect(line.element.style.getPropertyValue("fill")).toBe("");
    expect(line.element.style.getPropertyValue("transition")).toBe("none");
    handle.set({ emphasis: 0.5 });
    expect(line.element.style.getPropertyValue("stroke")).toBe(`color-mix(in srgb, ${seriesColors(2).strong} 50%, ${seriesColors(2).color})`);
    handle.set({ emphasis: undefined });
    expect(line.element.style.getPropertyValue("stroke")).toBe("");
    expect(line.element.style.getPropertyValue("transition")).toBe("");
  });

  it("has stylesheet rules for a stroked part: its mark's colour, and the strong one while hovered", () => {
    expect(stylesheet).toMatch(/:where\(\.ec-chart \.ec-stroke\) \{ fill: none; stroke: var\(--ec-mark\);[^}]*transition: stroke var\(--ec-hover-duration, 100ms\)/);
    expect(stylesheet).toContain(":where(.ec-chart .ec-hot .ec-stroke) { stroke: var(--ec-mark-strong); }");
    // No stroke width: the chart's own attribute sets it, as its geometry's thickness says.
    expect(stylesheet).not.toMatch(/\.ec-stroke\) \{[^}]*stroke-width/);
    // Dimming is the parts' opacity, so it fades a stroked part as it does a filled one, over the hover duration.
    expect(stylesheet).toContain(":where(.ec-chart.ec-hovering .ec-mark:not(.ec-hot) > .ec-body > *) { opacity: var(--ec-dim-opacity, 0.3); }");
    expect(stylesheet).toMatch(/:where\(\.ec-chart \.ec-stroke\) \{[^}]*transition: stroke [^;]*, opacity var\(--ec-hover-duration, 100ms\) ease-out; \}/);
  });

  it("strokes an open part's halo behind it at the line's width plus the halo's, round its ends", () => {
    const { body, part, target, handle } = setup();
    const line: StyledPart = { element: svgElement("path", { class: "ec-stroke", d: "M0,20L10,5L20,12" }, body), d: "M0,20L10,5L20,12", colors: seriesColors(2), visible: true, open: { width: 2.25 } };
    target.current = { body, parts: [part("M0,0L10,0L10,20Z", 1), line] };
    handle.set({ halo: { width: 8, opacity: 0.35 } });
    const [bar, stroke] = Array.from(body.querySelectorAll<SVGPathElement>(".ec-halo path"));
    expect(body.firstElementChild!.getAttribute("class")).toBe("ec-halo");
    expect(stroke!.getAttribute("d")).toBe("M0,20L10,5L20,12");
    expect(stroke!.getAttribute("stroke-width")).toBe("10.25");
    expect(stroke!.getAttribute("stroke-linecap")).toBe("round");
    expect(stroke!.getAttribute("stroke-linejoin")).toBe("round");
    expect(stroke!.style.getPropertyValue("fill")).toBe("none");
    expect(stroke!.style.getPropertyValue("stroke")).toBe(seriesColors(2).color);
    // A closed part's halo is as it was.
    expect(bar!.getAttribute("stroke-width")).toBe("8");
    expect(bar!.hasAttribute("stroke-linecap")).toBe(false);
  });

  describe("hover dimming, from the stylesheet the charts inject", () => {
    const env = (): ChartEnv => ({
      presets: createRegistry<PresetFactory>({ kind: "preset" }),
      icons: { get: () => undefined },
      motion: createMotion({ mode: "presentation", reducedMotion: { matches: false, subscribe: () => () => {} } }),
      clock: manualClock()
    });
    const container = () => document.body.appendChild(document.createElement("div"));
    const hover = (target: Element) => target.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
    /** What the stylesheet sets, as jsdom cascades it: "1" where no rule sets an opacity. */
    const opacity = (element: Element | null) => getComputedStyle(element!).opacity;
    const DIM = "var(--ec-dim-opacity, 0.3)";
    const players = [
      { name: "Okafor", goals: 16, assists: 4 },
      { name: "Tanaka", goals: 6, assists: 10 }
    ];

    it("dims the parts of the other bars' bodies, and not their labels, so text keeps its contrast", () => {
      const chart = barChart(container(), { label: "Goals and assists", data: players, y: "name", x: "goals", stack: ["goals", "assists"], width: 600 }, env());
      const mark = (key: string) => chart.element.querySelector(`.ec-mark[data-key="${key}"]`)!;
      hover(mark("Okafor").querySelector(".ec-segment")!);
      expect(chart.element.classList.contains("ec-hovering")).toBe(true);
      const other = mark("Tanaka");
      expect(Array.from(other.querySelectorAll(".ec-segment"), opacity)).toEqual([DIM, DIM]);
      expect([other, other.querySelector(".ec-body"), other.querySelector(".ec-label"), other.querySelector(".ec-value")].map(opacity)).toEqual(["1", "1", "1", "1"]);
      // The hovered bar is as it was.
      expect(Array.from(mark("Okafor").querySelectorAll(".ec-segment"), opacity)).toEqual(["1", "1"]);
      chart.element.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" }));
      expect(Array.from(other.querySelectorAll(".ec-segment"), opacity)).toEqual(["1", "1"]);
      chart.destroy();
    });

    it("dims the other slices, and not their labels outside the ring", () => {
      const shots = [
        { outcome: "Goal", shots: 58 },
        { outcome: "Saved", shots: 112 },
        { outcome: "Off target", shots: 149 }
      ];
      const chart = donutChart(container(), { label: "Shot outcomes", data: shots, category: "outcome", value: "shots", width: 640 }, env());
      const mark = (key: string) => chart.element.querySelector(`.ec-mark[data-key="${key}"]`)!;
      hover(mark("Saved").querySelector(".ec-slice")!);
      for (const key of ["Goal", "Off target"]) {
        const other = mark(key);
        expect(opacity(other.querySelector(".ec-slice"))).toBe(DIM);
        expect([other, other.querySelector(".ec-body"), ...other.querySelectorAll("text")].map(opacity)).toEqual(["1", "1", "1", "1"]);
      }
      expect(opacity(mark("Saved").querySelector(".ec-slice"))).toBe("1");
      chart.destroy();
    });

    it("leaves an effect's opacity on a dimmed body, so the two multiply", () => {
      // An effect that holds every bar at half opacity.
      const fade: GeometryEffect = {
        kind: "geometry",
        run(_mark, ctx) {
          ctx.mark.set({ opacity: 0.5 });
          return new Promise<void>((resolve) => ctx.signal.addEventListener("abort", () => resolve()));
        },
        end() {},
        clear() {}
      };
      const chart = barChart(container(), { label: "Goals", data: players, y: "name", x: "goals", width: 600, on: { decorate: fade } }, env());
      const mark = (key: string) => chart.element.querySelector(`.ec-mark[data-key="${key}"]`)!;
      hover(mark("Okafor").querySelector(".ec-segment")!);
      const body = mark("Tanaka").querySelector(".ec-body")!;
      // No rule overrides the body's attribute; its segment dims inside it: 0.5 × 0.3 on screen.
      expect(body.getAttribute("opacity")).toBe("0.5");
      expect(opacity(body)).toBe("1");
      expect(opacity(body.querySelector(".ec-segment"))).toBe(DIM);
      chart.destroy();
    });

    describe("the marks' decorations in the overlay", () => {
      const dot: Icon = {
        name: "dot",
        shapes: [{ d: "M-3,0A3,3 0 1 1 3,0A3,3 0 1 1 -3,0Z", fill: "mark" }],
        box: { x: -3, y: -3, width: 6, height: 6 },
        size: 6,
        anchor: { x: 0, y: 0 },
        pivot: { x: 0, y: 0 },
        footprint: [3, 3]
      };
      /** A path along the mark, a dot at its end and a label above it, kept until the mark goes. */
      const draw = (mark: MarkGeometry, ctx: EffectContext): void => {
        ctx.layer.path(mark.outline.d, { stroke: "mark", width: 2 });
        ctx.layer.icon(dot).place(matrix.translate(mark.end.x, mark.end.y));
        ctx.layer.text("+1", { at: { x: mark.end.x, y: mark.end.y - 8 } });
      };
      const decorations: GeometryEffect = { kind: "geometry", run: async (mark, ctx) => draw(mark, ctx), end: draw, clear() {} };
      const runOf = (svg: Element, key: string) => svg.querySelector(`.ec-overlay .ec-run[data-key="${key}"]`)!;

      it("dim with their bar, all but their text, which keeps its contrast as the bar's labels do", () => {
        const chart = barChart(container(), { label: "Goals", data: players, y: "name", x: "goals", width: 600, on: { decorate: decorations } }, env());
        const run = (key: string) => runOf(chart.element, key);
        hover(chart.element.querySelector('.ec-mark[data-key="Okafor"] .ec-segment')!);
        expect([run("Tanaka").querySelector(".ec-follow"), run("Tanaka").querySelector("text")].map(opacity)).toEqual([DIM, "1"]);
        expect(Array.from(run("Tanaka").querySelectorAll(".ec-follow > *"), (drawn) => drawn.getAttribute("class"))).toEqual(["ec-path", "ec-icon"]);
        // The hovered bar's stay as they were.
        expect(opacity(run("Okafor").querySelector(".ec-follow"))).toBe("1");
        chart.element.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" }));
        expect(opacity(run("Tanaka").querySelector(".ec-follow"))).toBe("1");
        chart.destroy();
      });

      it("dim with their slice", () => {
        const shots = [
          { outcome: "Goal", shots: 58 },
          { outcome: "Saved", shots: 112 },
          { outcome: "Off target", shots: 149 }
        ];
        const chart = donutChart(container(), { label: "Shot outcomes", data: shots, category: "outcome", value: "shots", width: 640, on: { decorate: decorations } }, env());
        hover(chart.element.querySelector('.ec-mark[data-key="Saved"] .ec-slice')!);
        expect(shots.map(({ outcome }) => opacity(runOf(chart.element, outcome).querySelector(".ec-follow")))).toEqual([DIM, "1", DIM]);
        chart.destroy();
      });

      it("turn with their bar's body, all but their text, as an effect turns it", () => {
        // An effect that tilts the hovered bar about its pivot until the hover ends.
        const tilt: GeometryEffect = {
          kind: "geometry",
          run(mark, ctx) {
            ctx.mark.set({ transform: matrix.rotate(0.02, mark.pivot) });
            return new Promise<void>((resolve) => ctx.signal.addEventListener("abort", () => resolve()));
          },
          end() {},
          clear() {}
        };
        const chart = barChart(container(), { label: "Goals", data: players, y: "name", x: "goals", width: 600, on: { decorate: decorations, hover: tilt } }, env());
        const run = (key: string) => runOf(chart.element, key);
        const body = chart.element.querySelector('.ec-mark[data-key="Okafor"] .ec-body')!;
        hover(body.querySelector(".ec-segment")!);
        expect(body.getAttribute("transform")).toMatch(/^matrix\(/);
        expect(run("Okafor").querySelector(".ec-follow")!.getAttribute("transform")).toBe(body.getAttribute("transform"));
        expect(run("Okafor").querySelector("text")!.hasAttribute("transform")).toBe(false);
        expect(run("Tanaka").querySelector(".ec-follow")!.hasAttribute("transform")).toBe(false);
        chart.element.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" }));
        expect(body.hasAttribute("transform")).toBe(false);
        expect(run("Okafor").querySelector(".ec-follow")!.hasAttribute("transform")).toBe(false);
        chart.destroy();
      });
    });
  });

  it("repaints onto redrawn parts, and reset() restores the mark's own style", () => {
    const { body, part, target, handle } = setup();
    handle.set({ emphasis: 1, halo: { width: 6, opacity: 0.3 }, opacity: 0.8 });
    const fresh = part("M0,0L30,0L30,20Z", 3);
    target.current = { body, parts: [fresh] };
    handle.repaint();
    expect(fresh.element.style.getPropertyValue("fill")).toBe("var(--ec-series-3-strong, #07835a)");
    expect(body.querySelectorAll(".ec-halo path")).toHaveLength(1);
    expect(handle.style).toEqual({ emphasis: 1, halo: { width: 6, opacity: 0.3 }, opacity: 0.8 });
    handle.reset();
    expect(handle.style).toEqual({});
    expect(fresh.element.style.getPropertyValue("fill")).toBe("");
    expect(body.getAttribute("opacity")).toBeNull();
    expect(body.querySelector(".ec-halo")).toBeNull();
  });
});
