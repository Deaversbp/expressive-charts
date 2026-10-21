import { createMotion, manualClock, type MotionMode } from "../core";
import { createRegistry, type PresetFactory } from "../core/registry";
import { play } from "../core/testing";
import { barChart, type ChartEnv } from "./bar";
import { tableModel, type TableInput } from "./table";
import type { BarChartOptions } from "./types";

interface Player {
  name: string;
  pos: string;
  goals: number;
  assists: number;
}

const players: Player[] = [
  { name: "Okafor", pos: "Forward", goals: 16, assists: 4 },
  { name: "Tanaka", pos: "Midfielder", goals: 6, assists: 10 },
  { name: "Lindqvist", pos: "Forward", goals: 10, assists: 7 }
];

function setup(options: Partial<BarChartOptions<Player>> = {}, mode: MotionMode = "presentation") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const clock = manualClock();
  const motion = createMotion({ mode, reducedMotion: { matches: false, subscribe: () => () => {} } });
  const env: ChartEnv = { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion, clock };
  const chart = barChart<Player>(container, { label: "Goals by player", data: players, y: "name", x: "goals", width: 600, ...options }, env);
  const table = () => container.querySelector<HTMLTableElement>(".ec-table table");
  /** The table's text: the header row, then each body row. */
  const text = () => Array.from(table()?.rows ?? [], (row) => Array.from(row.cells, (cell) => cell.textContent));
  const settle = (running: Promise<unknown>) => play(clock, running);
  return { container, chart, table, text, settle };
}

const withStack = { x: undefined, stack: ["goals", "assists"] } as const;

afterEach(() => {
  document.body.textContent = "";
});

describe("tableModel", () => {
  const input = (more: Partial<TableInput<Player>> = {}): TableInput<Player> => ({
    option: true,
    caption: "Goals",
    category: "name",
    series: ["goals", "assists"],
    rows: players.map((p, index) => ({ key: p.name, category: p.name, datum: p, index, values: [{ series: "goals", value: p.goals }, { series: "assists", value: p.assists }], total: p.goals + p.assists })),
    format: String,
    ...more
  });

  it("is nothing with table: false", () => {
    expect(tableModel(input({ option: false }))).toBeUndefined();
  });

  it("has the category, each series and the total, numbers right-aligned", () => {
    const model = tableModel(input())!;
    expect(model.headers).toEqual([
      { text: "name", numeric: false },
      { text: "goals", numeric: true },
      { text: "assists", numeric: true },
      { text: "Total", numeric: true }
    ]);
    expect(model.rows[1]).toEqual({
      key: "Tanaka",
      cells: [
        { text: "Tanaka", numeric: false },
        { text: "6", numeric: true },
        { text: "10", numeric: true },
        { text: "16", numeric: true }
      ]
    });
    expect(model).toMatchObject({ hidden: false, summary: "Data table", caption: "Goals" });
  });

  it("heads each series' column with its label", () => {
    const model = tableModel(input({ label: (series) => (series === "goals" ? "Goals" : series) }))!;
    expect(model.headers.map((header) => header.text)).toEqual(["name", "Goals", "assists", "Total"]);
  });

  it("counts a series a row doesn't have as 0", () => {
    const model = tableModel(input({ rows: [{ key: "A", category: "A", datum: players[0]!, index: 0, values: [{ series: "goals", value: 3 }], total: 3 }] }))!;
    expect(model.rows[0]!.cells.map((cell) => cell.text)).toEqual(["A", "3", "0", "3"]);
  });

  it("right-aligns an extra column only when it holds numbers", () => {
    const model = tableModel(
      input({
        option: {
          columns: [
            { label: "Position", field: "pos" },
            { label: "Index", field: (_d, i) => (i === 1 ? undefined : i) },
            { label: "Mixed", field: (_d, i) => (i === 1 ? "n/a" : i) }
          ]
        }
      })
    )!;
    expect(model.headers.slice(1, 4)).toEqual([
      { text: "Position", numeric: false },
      { text: "Index", numeric: true },
      { text: "Mixed", numeric: false }
    ]);
    expect(model.rows[1]!.cells.slice(1, 4)).toEqual([
      { text: "Midfielder", numeric: false },
      { text: "", numeric: false },
      { text: "n/a", numeric: false }
    ]);
  });
});

describe("barChart: data table", () => {
  it("is on by default: a closed <details> after the chart, its caption the chart's label", () => {
    const { container, chart, table } = setup();
    const details = container.querySelector("details.ec-table")!;
    expect(details.previousElementSibling).toBe(chart.element);
    expect((details as HTMLDetailsElement).open).toBe(false);
    expect(details.querySelector("summary")!.textContent).toBe("Data table");
    expect(table()!.closest("details")).toBe(details);
    const caption = table()!.caption!;
    expect(caption.textContent).toBe("Goals by player");
    expect(caption.className).toBe("ec-table-caption");
  });

  it("lists every row in the chart's order: the category and its value", () => {
    const { text } = setup();
    expect(text()).toEqual([
      ["name", "goals"],
      ["Okafor", "16"],
      ["Tanaka", "6"],
      ["Lindqvist", "10"]
    ]);
  });

  it("adds a total for a stack", () => {
    const { text } = setup(withStack);
    expect(text()).toEqual([
      ["name", "goals", "assists", "Total"],
      ["Okafor", "16", "4", "20"],
      ["Tanaka", "6", "10", "16"],
      ["Lindqvist", "10", "7", "17"]
    ]);
  });

  it("has real headers: columns in the head, each row's category in its own row", () => {
    const { table } = setup(withStack);
    const head = Array.from(table()!.tHead!.rows[0]!.cells);
    expect(head.map((cell) => [cell.tagName, cell.getAttribute("scope")])).toEqual([
      ["TH", "col"],
      ["TH", "col"],
      ["TH", "col"],
      ["TH", "col"]
    ]);
    const row = table()!.tBodies[0]!.rows[0]!;
    expect(Array.from(row.cells, (cell) => [cell.tagName, cell.getAttribute("scope")])).toEqual([
      ["TH", "row"],
      ["TD", null],
      ["TD", null],
      ["TD", null]
    ]);
    // Numbers right-aligned, the category not.
    expect(Array.from(row.cells, (cell) => cell.classList.contains("ec-num"))).toEqual([false, true, true, true]);
    expect(head.map((cell) => cell.classList.contains("ec-num"))).toEqual([false, true, true, true]);
  });

  it("follows the sort as soon as an update starts", async () => {
    const { chart, text, settle } = setup({ sort: "value" });
    expect(text().slice(1).map((row) => row[0])).toEqual(["Okafor", "Lindqvist", "Tanaka"]);
    const sorting = chart.update({ sort: "key" });
    expect(text().slice(1).map((row) => row[0])).toEqual(["Lindqvist", "Okafor", "Tanaka"]);
    await settle(sorting);
    expect(text().slice(1).map((row) => row[0])).toEqual(["Lindqvist", "Okafor", "Tanaka"]);
  });

  it("updates with the data, keeping each row's element and an open table open", async () => {
    const { container, chart, table, text, settle } = setup();
    const details = container.querySelector("details")!;
    details.open = true;
    const okafor = table()!.querySelector('tr[data-key="Okafor"]');
    const next = [{ ...players[0]!, goals: 17 }, players[2]!, { name: "Novak", pos: "Defender", goals: 3, assists: 1 }];
    await settle(chart.update({ data: next }));
    expect(text()).toEqual([
      ["name", "goals"],
      ["Okafor", "17"],
      ["Lindqvist", "10"],
      ["Novak", "3"]
    ]);
    expect(table()!.querySelector('tr[data-key="Okafor"]')).toBe(okafor);
    expect(container.querySelector("details")).toBe(details);
    expect(details.open).toBe(true);
  });

  it("follows stack changes", async () => {
    const { chart, text, settle } = setup(withStack);
    const switching = chart.update({ stack: ["assists"] });
    expect(text()).toEqual([
      ["name", "assists"],
      ["Okafor", "4"],
      ["Tanaka", "10"],
      ["Lindqvist", "7"]
    ]);
    await settle(switching);
    await settle(chart.update({ stack: ["goals", "assists"] }));
    expect(text()[0]).toEqual(["name", "goals", "assists", "Total"]);
    expect(text()[2]).toEqual(["Tanaka", "6", "10", "16"]);
  });

  it("uses the chart's format", async () => {
    const { chart, text, settle } = setup({ ...withStack, format: (value) => value.toFixed(1) });
    expect(text()[1]).toEqual(["Okafor", "16.0", "4.0", "20.0"]);
    await settle(chart.update({ format: (value) => `${value} pts` }));
    expect(text()[1]).toEqual(["Okafor", "16 pts", "4 pts", "20 pts"]);
  });

  it("follows the chart's label in its caption", async () => {
    const { chart, table, settle } = setup();
    await settle(chart.update({ label: "Assists by player", x: "assists" }));
    expect(table()!.caption!.textContent).toBe("Assists by player");
  });

  it("adds the page's columns after the category: a field or a function, in the chart's format or the column's", () => {
    const { text, table } = setup({
      ...withStack,
      format: (value) => value.toFixed(1),
      table: {
        columns: [
          { label: "Position", field: "pos" },
          { label: "Per assist", field: (d) => d.goals / d.assists },
          { label: "Row", field: (_d, i) => i + 1, format: (value) => `#${String(value)}` }
        ]
      }
    });
    expect(text()).toEqual([
      ["name", "Position", "Per assist", "Row", "goals", "assists", "Total"],
      ["Okafor", "Forward", "4.0", "#1", "16.0", "4.0", "20.0"],
      ["Tanaka", "Midfielder", "0.6", "#2", "6.0", "10.0", "16.0"],
      ["Lindqvist", "Forward", "1.4", "#3", "10.0", "7.0", "17.0"]
    ]);
    const head = Array.from(table()!.tHead!.rows[0]!.cells, (cell) => cell.classList.contains("ec-num"));
    expect(head).toEqual([false, false, true, true, true, true, true]);
  });

  it("takes its headers' and summary's text from the option", () => {
    const { container, text } = setup({ ...withStack, table: { category: "Player", total: "Goals + assists", summary: "Show the numbers" } });
    expect(text()[0]).toEqual(["Player", "goals", "assists", "Goals + assists"]);
    expect(container.querySelector("summary")!.textContent).toBe("Show the numbers");
  });

  it('heads the categories "Category" when a function reads them', () => {
    const { text } = setup({ y: (d) => d.name.toUpperCase() });
    expect(text()[0]).toEqual(["Category", "goals"]);
    expect(text()[1]![0]).toBe("OKAFOR");
  });

  it("lists columns left to right, for a vertical chart", () => {
    const { text } = setup({ x: "name", y: "goals", sort: "value" });
    expect(text().slice(1).map((row) => row[0])).toEqual(["Okafor", "Lindqvist", "Tanaka"]);
  });

  it('is visually hidden with "hidden", and still a captioned table', async () => {
    const { container, chart, table, text, settle } = setup({ table: "hidden" });
    expect(container.querySelector("details")).toBeNull();
    const wrapper = table()!.parentElement!;
    expect(wrapper.className).toBe("ec-table ec-visually-hidden");
    expect(wrapper.previousElementSibling).toBe(chart.element);
    expect(table()!.caption!.textContent).toBe("Goals by player");
    expect(text()).toHaveLength(4);

    // Shown again, the same table moves into a <details> in the same place.
    const same = table();
    await settle(chart.update({ table: true }));
    expect(table()).toBe(same);
    expect(table()!.closest("details")!.previousElementSibling).toBe(chart.element);
    expect(container.querySelector(".ec-visually-hidden")).toBeNull();

    await settle(chart.update({ table: { hidden: true } }));
    expect(table()!.parentElement!.classList.contains("ec-visually-hidden")).toBe(true);
  });

  it("goes with table: false, and comes back", async () => {
    const { container, chart, table, text, settle } = setup({ table: false });
    expect(container.querySelector(".ec-table")).toBeNull();
    await settle(chart.update({ table: true, sort: "value" }));
    expect(table()).not.toBeNull();
    expect(text().slice(1).map((row) => row[0])).toEqual(["Okafor", "Lindqvist", "Tanaka"]);
    await settle(chart.update({ table: false }));
    expect(container.querySelector(".ec-table")).toBeNull();
  });

  it("sets its text as text, never as HTML", () => {
    const { table } = setup({
      data: [{ name: "<b>Okafor</b>", pos: "<i>Forward</i>", goals: 16, assists: 4 }],
      table: { columns: [{ label: "<u>Position</u>", field: "pos" }], summary: "<em>Data</em>" }
    });
    expect(table()!.querySelector("b, i, u")).toBeNull();
    expect(table()!.tBodies[0]!.rows[0]!.cells[1]!.textContent).toBe("<i>Forward</i>");
    expect(document.querySelector("summary em")).toBeNull();
  });

  it("rejects an option it can't use, and an update whose column throws changes nothing", async () => {
    expect(() => setup({ table: "visible" as never })).toThrow(/table must be true, false, "hidden" or an object/);
    expect(() => setup({ table: { columns: [{ label: "Position" } as never] } })).toThrow(/table\.columns\[0\]\.field/);
    expect(() => setup({ table: { columns: "pos" as never } })).toThrow(/table\.columns must be an array/);
    expect(() => setup({ table: { summary: 3 as never } })).toThrow(/table\.summary must be a string/);

    const { chart, text } = setup();
    const before = text();
    const broken = {
      columns: [
        {
          label: "Broken",
          field: () => {
            throw new Error("column");
          }
        }
      ]
    };
    await expect(chart.update({ table: broken, sort: "key" })).rejects.toThrow("column");
    expect(text()).toEqual(before);
  });

  it("leaves nothing behind when a column throws as the chart is made", () => {
    const container = document.body.appendChild(document.createElement("div"));
    let subscribed = 0;
    const motion = createMotion({ mode: "presentation", reducedMotion: { matches: false, subscribe: () => () => {} } });
    const subscribe = motion.subscribe.bind(motion);
    motion.subscribe = (listener) => {
      subscribed++;
      return subscribe(listener);
    };
    const env: ChartEnv = { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion, clock: manualClock() };
    const add = vi.spyOn(EventTarget.prototype, "addEventListener");
    const broken = () => {
      throw new Error("column");
    };
    expect(() =>
      barChart<Player>(container, { label: "Goals by player", data: players, y: "name", x: "goals", width: 600, announce: true, table: { columns: [{ label: "Broken", field: broken }] } }, env)
    ).toThrow("column");
    expect(container.childNodes).toHaveLength(0);
    expect(add).not.toHaveBeenCalled();
    expect(subscribed).toBe(0);
    add.mockRestore();
  });

  it("is removed with the chart", () => {
    const { container, chart } = setup();
    chart.destroy();
    expect(container.querySelector(".ec-table")).toBeNull();
  });
});
