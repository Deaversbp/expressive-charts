import type { MarkGeometry } from "../../core";
import { chartEvents } from "./events";

const mark = { outline: { d: "M0 0" } } as unknown as MarkGeometry;
const data = { datum: {}, samples: [], related: () => undefined };

describe("chartEvents", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("names the chart and its events when an event is unknown", () => {
    const events = chartEvents("donutChart");
    expect(() => events.on("click" as never, () => {})).toThrow('donutChart: unknown event "click". Use one of: enter, update, exit, hover, leave.');
  });

  it("numbers each mark in its batch, reading each as it's emitted", () => {
    const events = chartEvents<object>("chart");
    const heard: unknown[] = [];
    events.on("enter", (event) => heard.push(event.batch));
    const read = vi.fn((key: string) => ({ mark, data: { ...data, datum: { key } } }));
    events.emitEach("enter", ["a", "b"], read);
    expect(heard).toEqual([
      { index: 0, count: 2 },
      { index: 1, count: 2 }
    ]);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("reports a listener that throws, and the others still hear the event", () => {
    const reportError = vi.fn();
    vi.stubGlobal("reportError", reportError);
    const events = chartEvents<object>("chart");
    const heard = vi.fn();
    events.on("leave", () => {
      throw new Error("listener");
    });
    events.on("leave", heard);
    events.emit("leave", { mark, data, batch: { index: 0, count: 1 } });
    expect(heard).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: "listener" }));
  });

  it("unsubscribes, and clears every listener", () => {
    const events = chartEvents<object>("chart");
    const one = vi.fn();
    const two = vi.fn();
    const off = events.on("exit", one);
    events.on("exit", two);
    off();
    events.emit("exit", { mark, data, batch: { index: 0, count: 1 } });
    events.clear();
    events.emit("exit", { mark, data, batch: { index: 0, count: 1 } });
    expect(one).not.toHaveBeenCalled();
    expect(two).toHaveBeenCalledTimes(1);
  });
});
