import { checkSeriesLabels, seriesLabel } from "./series";

describe("seriesLabel", () => {
  it("gives a series its label, or its own name", () => {
    expect(seriesLabel({ goals: "Goals" }, "goals")).toBe("Goals");
    expect(seriesLabel({ goals: "Goals" }, "assists")).toBe("assists");
    expect(seriesLabel(undefined, "goals")).toBe("goals");
  });

  it("reads only the labels' own keys", () => {
    expect(seriesLabel({}, "constructor")).toBe("constructor");
    expect(seriesLabel({}, "toString")).toBe("toString");
  });
});

describe("checkSeriesLabels", () => {
  it("takes nothing, or an object of names", () => {
    expect(() => checkSeriesLabels(undefined, "barChart")).not.toThrow();
    expect(() => checkSeriesLabels({}, "barChart")).not.toThrow();
    expect(() => checkSeriesLabels({ goals: "Goals", xg: "Expected goals" }, "barChart")).not.toThrow();
  });

  it("throws on anything else, naming the chart and the series", () => {
    expect(() => checkSeriesLabels("Goals", "barChart")).toThrow(/^barChart: seriesLabels must be an object of names by series/);
    expect(() => checkSeriesLabels(null, "barChart")).toThrow(/seriesLabels must be an object/);
    expect(() => checkSeriesLabels(["Goals"], "barChart")).toThrow(/seriesLabels must be an object/);
    expect(() => checkSeriesLabels({ goals: "" }, "barChart")).toThrow("barChart: seriesLabels.goals must be a name, not blank.");
    expect(() => checkSeriesLabels({ goals: undefined }, "barChart")).toThrow("barChart: seriesLabels.goals must be a name, not undefined.");
  });
});
