import { createMotion, manualClock } from "../core";
import { createRegistry, type PresetFactory } from "../core/registry";
import { play } from "../core/testing";
import { changeText, chartAnnouncer, type ChangeFacts } from "./announce";
import { barChart, type ChartEnv } from "./bar";
import type { BarChartOptions } from "./types";

interface Player {
  name: string;
  goals: number;
  assists: number;
}

const players: Player[] = [
  { name: "Okafor", goals: 16, assists: 4 },
  { name: "Tanaka", goals: 6, assists: 10 },
  { name: "Lindqvist", goals: 10, assists: 7 }
];

function setup(options: Partial<BarChartOptions<Player>> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const clock = manualClock();
  const motion = createMotion({ mode: "presentation", reducedMotion: { matches: false, subscribe: () => () => {} } });
  const env: ChartEnv = { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion, clock };
  const chart = barChart<Player>(container, { label: "Goals by player", data: players, y: "name", x: "goals", width: 600, ...options }, env);
  const region = () => container.querySelector<HTMLElement>(".ec-announcer");
  /** What the region says, without the space that makes a repeat a change. */
  const said = () => region()?.textContent?.replace(/ $/, "");
  const settle = (running: Promise<unknown>) => play(clock, running);
  return { container, chart, region, said, settle };
}

const facts = (more: Partial<ChangeFacts>): ChangeFacts => ({ changed: [], added: [], removed: [], count: 8, ...more });

afterEach(() => {
  document.body.textContent = "";
  vi.unstubAllGlobals();
});

describe("changeText", () => {
  it("says nothing when nothing it reports changed", () => {
    expect(changeText(facts({}))).toBe("");
  });

  it("names the sort", () => {
    expect(changeText(facts({ sort: "key" }))).toBe("Sorted A to Z");
    expect(changeText(facts({ sort: "value" }))).toBe("Sorted highest first");
    expect(changeText(facts({ sort: "none" }))).toBe("In data order");
    expect(changeText(facts({ sort: "custom" }))).toBe("Sorted");
  });

  it("names up to three marks that changed, and counts more", () => {
    expect(changeText(facts({ changed: ["Okafor"] }))).toBe("Okafor changed");
    expect(changeText(facts({ changed: ["Okafor", "Tanaka"] }))).toBe("Okafor and Tanaka changed");
    expect(changeText(facts({ changed: ["Okafor", "Tanaka", "Reyes"] }))).toBe("Okafor, Tanaka and Reyes changed");
    expect(changeText(facts({ changed: ["a", "b", "c", "d"] }))).toBe("4 of 8 changed");
    expect(changeText(facts({ added: ["Novak"], removed: ["a", "b", "c", "d"] }))).toBe("Added Novak. Removed 4");
  });

  it("says a new label, or else the new series, instead of every value changing", () => {
    const all = ["a", "b", "c", "d", "e"];
    expect(changeText(facts({ label: "Assists by player", series: ["assists"], changed: all }))).toBe("Assists by player");
    expect(changeText(facts({ series: ["goals", "assists"], changed: all, sort: "key" }))).toBe("Showing goals and assists. Sorted A to Z");
    // A lone value read by a function has no name to say.
    expect(changeText(facts({ series: ["value"], changed: all }))).toBe("");
  });
});

describe("chartAnnouncer", () => {
  it("is a visually hidden, polite, atomic status just after the <svg>", () => {
    const container = document.createElement("div");
    const svg = container.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "svg"));
    const announcer = chartAnnouncer(svg);
    const region = svg.nextElementSibling as HTMLElement;
    expect(region.className).toBe("ec-announcer ec-visually-hidden");
    expect(region.getAttribute("role")).toBe("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.getAttribute("aria-atomic")).toBe("true");
    expect(region.textContent).toBe("");

    announcer.say("Sorted A to Z");
    expect(region.textContent).toBe("Sorted A to Z");
    // The same text again is still a change, so it's announced again.
    announcer.say("Sorted A to Z");
    expect(region.textContent).toBe("Sorted A to Z ");
    announcer.say("");
    expect(region.textContent).toBe("Sorted A to Z ");
    announcer.destroy();
    expect(region.isConnected).toBe(false);
  });
});

describe("barChart: announce", () => {
  it("is off by default: no live region", async () => {
    const { container, chart, settle } = setup();
    await settle(chart.update({ sort: "key" }));
    expect(container.querySelector('[role="status"], [aria-live]')).toBeNull();
  });

  it("sums up each update as it starts", async () => {
    const { chart, region, said, settle } = setup({ announce: true });
    // Beside the chart, after it.
    expect(region()!.parentElement).toBe(chart.element.parentElement);
    expect(chart.element.compareDocumentPosition(region()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(said()).toBe("");

    const sorting = chart.update({ sort: "key" });
    expect(said()).toBe("Sorted A to Z");
    await settle(sorting);

    await settle(chart.update({ data: players.map((p) => (p.name === "Tanaka" ? { ...p, goals: 7 } : p)) }));
    expect(said()).toBe("Tanaka changed");

    await settle(chart.update({ label: "Goals and assists", x: undefined, stack: ["goals", "assists"] }));
    expect(said()).toBe("Goals and assists");

    await settle(chart.update({ stack: ["assists"], sort: "value" }));
    expect(said()).toBe("Showing assists. Sorted highest first");

    await settle(chart.update({ data: [...players.slice(1), { name: "Novak", goals: 3, assists: 1 }] }));
    expect(said()).toBe("Added Novak. Removed Okafor");
  });

  it("announces a repeat again, and says nothing for an update that changes nothing it reports", async () => {
    const { chart, region, said, settle } = setup({ announce: true });
    await settle(chart.update({ data: players.map((p) => (p.name === "Okafor" ? { ...p, goals: 17 } : p)) }));
    const first = region()!.textContent;
    await settle(chart.update({ data: players.map((p) => (p.name === "Okafor" ? { ...p, goals: 18 } : p)) }));
    expect(said()).toBe("Okafor changed");
    expect(region()!.textContent).not.toBe(first);
    const second = region()!.textContent;
    await settle(chart.update({ dim: false }));
    expect(region()!.textContent).toBe(second);
  });

  it("takes the page's text from a function given the change", async () => {
    const seen: unknown[] = [];
    let matchweek = 24;
    const { chart, said, settle } = setup({
      announce: (change) => {
        seen.push(change);
        return `Matchweek ${matchweek}: ${change.text}`;
      }
    });
    matchweek = 25;
    await settle(chart.update({ data: players.map((p) => ({ ...p, goals: p.name === "Lindqvist" ? p.goals : p.goals + 1 })) }));
    expect(said()).toBe("Matchweek 25: Okafor and Tanaka changed");
    expect(seen).toEqual([{ text: "Okafor and Tanaka changed", changed: ["Okafor", "Tanaka"], added: [], removed: [] }]);
  });

  it("gives keys in the change and names in its text", async () => {
    let change: unknown;
    const { chart, settle } = setup({
      key: (d) => d.name.toLowerCase(),
      announce: (c) => {
        change = c;
        return undefined;
      }
    });
    await settle(chart.update({ data: players.slice(0, 2) }));
    expect(change).toEqual({ text: "Removed Lindqvist", changed: [], added: [], removed: ["lindqvist"] });
  });

  it("says nothing for an empty string or undefined, and reports a function that throws", async () => {
    const reportError = vi.fn();
    vi.stubGlobal("reportError", reportError);
    let answer: () => string | undefined = () => "";
    const { chart, said, settle } = setup({ announce: () => answer() });
    await settle(chart.update({ sort: "key" }));
    expect(said()).toBe("");
    answer = () => {
      throw new Error("announce");
    };
    await settle(chart.update({ sort: "value" }));
    expect(said()).toBe("");
    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: "announce" }));
  });

  it("turned on by update(), announces from the next update; turned off, removes the region", async () => {
    const { chart, region, said, settle } = setup();
    await settle(chart.update({ announce: true, sort: "key" }));
    expect(region()).not.toBeNull();
    expect(said()).toBe("");
    await settle(chart.update({ sort: "value" }));
    expect(said()).toBe("Sorted highest first");
    await settle(chart.update({ announce: false, sort: "key" }));
    expect(region()).toBeNull();
  });

  it("rejects an option that isn't true, false or a function, and is removed with the chart", () => {
    expect(() => setup({ announce: "yes" as never })).toThrow(/announce must be true, false or a function/);
    const { chart, region } = setup({ announce: true });
    chart.destroy();
    expect(region()).toBeNull();
  });
});
