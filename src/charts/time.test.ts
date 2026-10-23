import { boundaries, timeLevel, timeName, timeStep, timeTicks, type TimeZone } from "./time";

/** Node's environment: the library has no Node types. */
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

const RealDateTimeFormat = Intl.DateTimeFormat;

/** Makes `locale` the page's: Intl.DateTimeFormat given no locale uses it. */
function useLocale(locale: string): void {
  vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (locales?: string | string[], options?: Intl.DateTimeFormatOptions) {
    return new RealDateTimeFormat(locales ?? locale, options);
  } as unknown as typeof Intl.DateTimeFormat);
}

/** Pins the viewer's clock to an IANA zone for the tests in the describe block it's called in. */
function inZone(zone: string): void {
  const before = env.TZ;
  beforeAll(() => {
    env.TZ = zone;
  });
  afterAll(() => {
    if (before === undefined) delete env.TZ;
    else env.TZ = before;
  });
}

/** Spaces as spaces: some ICU versions put a narrow no-break space before "PM". */
const plain = (text: string): string => text.replace(/[  ]/g, " ");
const ms = (iso: string): number => Date.parse(iso);
const iso = (t: number): string => new Date(t).toISOString();

/** Each tick as "<ISO time> <text>". */
function ticks(lo: string, hi: string, zone: TimeZone = "UTC"): string[] {
  return timeTicks(ms(lo), ms(hi), zone).map((tick) => `${iso(tick.value)} ${plain(tick.text)}`);
}

/** Each tick's text. */
function texts(lo: string, hi: string, zone: TimeZone = "UTC"): string[] {
  return timeTicks(ms(lo), ms(hi), zone).map((tick) => plain(tick.text));
}

beforeEach(() => useLocale("en-US"));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("timeStep", () => {
  it("is the smallest step that can be the span long, from a second to years in the number axis's nice steps", () => {
    const second = 1000;
    const minute = 60 * second;
    const hour = 60 * minute;
    const day = 24 * hour;
    const steps: [number, string][] = [
      [0.4 * second, "1 second"],
      [10 * second, "15 second"],
      [20 * minute, "30 minute"],
      [2 * hour, "3 hour"],
      [13 * hour, "1 day"],
      [1.5 * day, "2 day"],
      [3 * day, "1 week"],
      [20 * day, "1 month"],
      [60 * day, "3 month"],
      [120 * day, "1 year"],
      [365 * day, "1 year"],
      [2.5 * 365 * day, "5 year"],
      [30 * 365 * day, "50 year"]
    ];
    for (const [span, expected] of steps) {
      const step = timeStep(span);
      expect(`${step.count} ${step.unit}`, `${span} ms`).toBe(expected);
    }
  });
});

describe("timeTicks in UTC", () => {
  it("labels both ends and a step of about a quarter of the range, each tick worded for its level", () => {
    // Seconds: 45 s in 15 s steps.
    expect(ticks("2026-01-01T12:00:07Z", "2026-01-01T12:00:52Z")).toEqual([
      "2026-01-01T12:00:07.000Z 12:00:07 PM",
      "2026-01-01T12:00:15.000Z 12:00:15 PM",
      "2026-01-01T12:00:30.000Z 12:00:30 PM",
      "2026-01-01T12:00:45.000Z 12:00:45 PM",
      "2026-01-01T12:00:52.000Z 12:00:52 PM"
    ]);
    // Minutes: 43 min in 15 min steps, the hour a time too.
    expect(texts("2026-01-01T09:58:00Z", "2026-01-01T10:41:00Z")).toEqual(["9:58 AM", "10:00 AM", "10:15 AM", "10:30 AM", "10:41 AM"]);
    // Hours: 22 h in 6 h steps; midnight is a day, and the ends say theirs.
    expect(texts("2026-02-05T13:00:00Z", "2026-02-06T11:00:00Z")).toEqual(["Feb 5, 1:00 PM", "6:00 PM", "Feb 6", "6:00 AM", "Feb 6, 11:00 AM"]);
    // Days: the ends aren't midnights, so they say their day too.
    expect(texts("2026-02-05T13:00:00Z", "2026-02-09T13:00:00Z")).toEqual(["Feb 5, 1:00 PM", "Feb 6", "Feb 7", "Feb 8", "Feb 9", "Feb 9, 1:00 PM"]);
    // Weeks start on Monday.
    expect(ticks("2026-02-03T00:00:00Z", "2026-02-24T00:00:00Z")).toEqual([
      "2026-02-03T00:00:00.000Z Feb 3",
      "2026-02-09T00:00:00.000Z Feb 9",
      "2026-02-16T00:00:00.000Z Feb 16",
      "2026-02-23T00:00:00.000Z Feb 23",
      "2026-02-24T00:00:00.000Z Feb 24"
    ]);
    // A year of days in quarters; the first is a year.
    expect(texts("2026-01-01T00:00:00Z", "2026-12-31T00:00:00Z")).toEqual(["2026", "Apr", "Jul", "Oct", "Dec 31"]);
    // Months across a new year, which says its year, as the ends do.
    expect(texts("2025-11-15T00:00:00Z", "2026-03-10T00:00:00Z")).toEqual(["Nov 15, 2025", "Dec", "2026", "Feb", "Mar", "Mar 10, 2026"]);
  });

  it("gives years in the number axis's nice steps, an end off a year saying its year", () => {
    expect(texts("2026-01-05T00:00:00Z", "2036-01-05T00:00:00Z")).toEqual(["Jan 5, 2026", "2030", "2035", "Jan 5, 2036"]);
    // Decades: 40 years in steps of 20.
    expect(ticks("1990-01-01T00:00:00Z", "2030-06-15T00:00:00Z")).toEqual([
      "1990-01-01T00:00:00.000Z 1990",
      "2000-01-01T00:00:00.000Z 2000",
      "2020-01-01T00:00:00.000Z 2020",
      "2030-06-15T00:00:00.000Z Jun 15, 2030"
    ]);
    // An end on a month says the month and its year.
    expect(texts("2020-03-01T00:00:00Z", "2030-01-01T00:00:00Z")).toEqual(["Mar 2020", "2025", "2030"]);
  });

  it("puts a month's ticks on its first, wherever the range starts or ends", () => {
    expect(ticks("2026-01-31T00:00:00Z", "2026-05-31T00:00:00Z")).toEqual([
      "2026-01-31T00:00:00.000Z Jan 31",
      "2026-02-01T00:00:00.000Z Feb",
      "2026-03-01T00:00:00.000Z Mar",
      "2026-04-01T00:00:00.000Z Apr",
      "2026-05-01T00:00:00.000Z May",
      "2026-05-31T00:00:00.000Z May 31"
    ]);
    // Three months from the start of a quarter.
    expect(texts("2026-02-28T00:00:00Z", "2026-12-31T00:00:00Z")).toEqual(["Feb 28", "Apr", "Jul", "Oct", "Dec 31"]);
  });

  it("counts leap days: every other day from each month's 1st, and a leap day at either end", () => {
    expect(ticks("2024-02-27T00:00:00Z", "2024-03-03T00:00:00Z")).toEqual([
      "2024-02-27T00:00:00.000Z Feb 27",
      "2024-02-29T00:00:00.000Z Feb 29",
      "2024-03-01T00:00:00.000Z Mar",
      "2024-03-03T00:00:00.000Z Mar 3"
    ]);
    expect(texts("2020-02-29T00:00:00Z", "2028-02-29T00:00:00Z")).toEqual(["Feb 29, 2020", "2022", "2024", "2026", "2028", "Feb 29, 2028"]);
    // Days across a leap day's month end.
    expect(texts("2024-02-28T00:00:00Z", "2024-03-01T12:00:00Z")).toEqual(["Feb 28", "Feb 29", "Mar", "Mar 1, 12:00 PM"]);
    // A leap year's 366 days still go in quarters.
    expect(texts("2024-01-01T00:00:00Z", "2025-01-01T00:00:00Z")).toEqual(["2024", "Apr", "Jul", "Oct", "2025"]);
  });

  it("says everything up to its year for a lone time", () => {
    expect(texts("2026-01-05T00:00:00Z", "2026-01-05T00:00:00Z")).toEqual(["Jan 5, 2026"]);
    expect(texts("2026-01-05T13:00:00Z", "2026-01-05T13:00:00Z")).toEqual(["Jan 5, 2026, 1:00 PM"]);
    expect(texts("2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z")).toEqual(["2026"]);
  });

  it("says milliseconds at an end that has them, so ends a fraction of a second apart differ", () => {
    expect(texts("2026-01-01T12:00:00.100Z", "2026-01-01T12:00:00.900Z")).toEqual(["12:00:00.100 PM", "12:00:00.900 PM"]);
  });

  it("words each level in the page's locale", () => {
    useLocale("en-GB");
    expect(texts("2026-02-05T13:00:00Z", "2026-02-09T13:00:00Z")).toEqual(["5 Feb, 13:00", "6 Feb", "7 Feb", "8 Feb", "9 Feb", "9 Feb, 13:00"]);
    expect(texts("2026-01-05T00:00:00Z", "2036-01-05T00:00:00Z")).toEqual(["5 Jan 2026", "2030", "2035", "5 Jan 2036"]);
    expect(texts("2026-01-01T09:58:00Z", "2026-01-01T10:41:00Z")).toEqual(["9:58", "10:00", "10:15", "10:30", "10:41"]);
  });
});

describe("timeTicks in local time, across daylight saving in New York", () => {
  inZone("America/New_York");

  it("keeps ticks on the clock's hours when the clocks go forward", () => {
    // 10 PM on 7 March to 10 AM on 8 March 2026: 11 hours, since 2 AM is skipped. 3 hour steps.
    expect(ticks("2026-03-08T03:00:00Z", "2026-03-08T14:00:00Z", "local")).toEqual([
      "2026-03-08T03:00:00.000Z Mar 7, 10:00 PM",
      "2026-03-08T05:00:00.000Z Mar 8",
      // Two hours after midnight: 3 AM comes straight after 1:59.
      "2026-03-08T07:00:00.000Z 3:00 AM",
      "2026-03-08T10:00:00.000Z 6:00 AM",
      "2026-03-08T13:00:00.000Z 9:00 AM",
      "2026-03-08T14:00:00.000Z Mar 8, 10:00 AM"
    ]);
  });

  it("gives an hour the clocks repeat a tick each time when they go back", () => {
    // 12:30 AM to 3:30 AM on 1 November 2026: four hours, 1 AM twice.
    expect(ticks("2026-11-01T04:30:00Z", "2026-11-01T08:30:00Z", "local")).toEqual([
      "2026-11-01T04:30:00.000Z 12:30 AM",
      "2026-11-01T05:00:00.000Z 1:00 AM",
      "2026-11-01T06:00:00.000Z 1:00 AM",
      "2026-11-01T07:00:00.000Z 2:00 AM",
      "2026-11-01T08:00:00.000Z 3:00 AM",
      "2026-11-01T08:30:00.000Z 3:30 AM"
    ]);
  });

  it("puts days and months at local midnight, however long the day", () => {
    // 1 November is 25 hours long.
    expect(ticks("2026-10-30T04:00:00Z", "2026-11-02T05:00:00Z", "local")).toEqual([
      "2026-10-30T04:00:00.000Z Oct 30",
      "2026-10-31T04:00:00.000Z Oct 31",
      "2026-11-01T04:00:00.000Z Nov",
      "2026-11-02T05:00:00.000Z Nov 2"
    ]);
    // Midnight is 5 AM in UTC before 8 March, and 4 AM after.
    expect(boundaries(ms("2026-01-15T05:00:00Z"), ms("2026-05-15T04:00:00Z"), { unit: "month", count: 1 }, "local").map(iso)).toEqual([
      "2026-02-01T05:00:00.000Z",
      "2026-03-01T05:00:00.000Z",
      "2026-04-01T04:00:00.000Z",
      "2026-05-01T04:00:00.000Z"
    ]);
  });

  it("leaves UTC alone: its ticks don't follow the viewer's clock", () => {
    expect(ticks("2026-01-01T00:00:00Z", "2026-12-31T00:00:00Z")).toEqual([
      "2026-01-01T00:00:00.000Z 2026",
      "2026-04-01T00:00:00.000Z Apr",
      "2026-07-01T00:00:00.000Z Jul",
      "2026-10-01T00:00:00.000Z Oct",
      "2026-12-31T00:00:00.000Z Dec 31"
    ]);
    // The same instants in local time: New Year in UTC is 7 PM on 31 December, so the ends are in two years.
    expect(texts("2026-01-01T00:00:00Z", "2026-12-31T00:00:00Z", "local")).toEqual(["Dec 31, 2025, 7:00 PM", "2026", "Apr", "Jul", "Oct", "Dec 30, 2026, 7:00 PM"]);
  });
});

describe("timeTicks in local time, across Lord Howe Island's half-hour clock change", () => {
  inZone("Australia/Lord_Howe");

  it("keeps hour ticks on the hour after the clocks go back half an hour", () => {
    // Midnight to 3:30 AM on 5 April 2026: at 2 AM the clocks go back to 1:30, so it's four hours.
    // Hourly steps, and the hours after the change are 15:30 and 16:30 in UTC.
    expect(ticks("2026-04-04T13:00:00Z", "2026-04-04T17:00:00Z", "local")).toEqual([
      "2026-04-04T13:00:00.000Z Apr 5",
      "2026-04-04T14:00:00.000Z 1:00 AM",
      "2026-04-04T15:30:00.000Z 2:00 AM",
      "2026-04-04T16:30:00.000Z 3:00 AM",
      "2026-04-04T17:00:00.000Z 3:30 AM"
    ]);
  });
});

describe("timeLevel", () => {
  it("is the coarsest boundary a time falls on, in its zone", () => {
    const levels = ["2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z", "2026-02-08T00:00:00Z", "2026-02-08T15:00:00Z", "2026-02-08T15:04:00Z", "2026-02-08T15:04:05Z", "2026-02-08T15:04:05.5Z"].map((t) =>
      timeLevel(ms(t), "UTC")
    );
    expect(levels).toEqual(["year", "month", "day", "hour", "minute", "second", "millisecond"]);
  });
});

describe("timeName", () => {
  const name = (times: string[], zone: TimeZone = "UTC") => {
    const say = timeName(times.map(ms), zone);
    return times.map((t) => plain(say(ms(t))));
  };

  it("says a medium date, with the time when any has one, and its seconds when any has those", () => {
    expect(name(["2026-01-05T00:00:00Z", "2026-01-06T00:00:00Z"])).toEqual(["Jan 5, 2026", "Jan 6, 2026"]);
    expect(name(["2026-01-05T00:00:00Z", "2026-01-05T13:00:00Z"])).toEqual(["Jan 5, 2026, 12:00 AM", "Jan 5, 2026, 1:00 PM"]);
    expect(name(["2026-01-05T13:00:00Z", "2026-01-05T13:00:30Z"])).toEqual(["Jan 5, 2026, 1:00:00 PM", "Jan 5, 2026, 1:00:30 PM"]);
  });

  it("says milliseconds when any has them, so no two times are said alike", () => {
    expect(name(["2026-01-05T12:00:00.100Z", "2026-01-05T12:00:00.900Z", "2026-01-05T12:00:01Z"])).toEqual([
      "Jan 5, 2026, 12:00:00.100 PM",
      "Jan 5, 2026, 12:00:00.900 PM",
      "Jan 5, 2026, 12:00:01.000 PM"
    ]);
  });

  it("says it in the page's locale", () => {
    useLocale("en-GB");
    expect(name(["2026-01-05T00:00:00Z"])).toEqual(["5 Jan 2026"]);
    expect(name(["2026-01-05T13:00:00Z"])).toEqual(["5 Jan 2026, 13:00"]);
    expect(name(["2026-01-05T13:00:00.1Z"])).toEqual(["5 Jan 2026, 13:00:00.100"]);
  });

  describe("in local time", () => {
    inZone("America/New_York");

    it("says the viewer's date and time, which a UTC midnight has", () => {
      expect(name(["2026-01-05T00:00:00Z"], "local")).toEqual(["Jan 4, 2026, 7:00 PM"]);
      expect(name(["2026-01-05T05:00:00Z"], "local")).toEqual(["Jan 5, 2026"]);
      expect(name(["2026-01-05T00:00:00Z"])).toEqual(["Jan 5, 2026"]);
    });
  });
});
