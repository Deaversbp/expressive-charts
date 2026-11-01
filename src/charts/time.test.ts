import { boundaries, isTimeZone, monthsOn, timeLevel, timeName, timeStep, timeTicks, type TimeZone } from "./time";

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

describe("monthsOn", () => {
  const on = (t: string, months: number, zone: TimeZone = "UTC"): string => iso(monthsOn(ms(t), months, zone));

  it("keeps the day of the month and the time of day, or ends a shorter month on its last day", () => {
    expect(on("2026-01-15T09:30:00.250Z", 1)).toBe("2026-02-15T09:30:00.250Z");
    expect(on("2026-01-31T00:00:00Z", 1)).toBe("2026-02-28T00:00:00.000Z");
    expect(on("2028-01-31T00:00:00Z", 1)).toBe("2028-02-29T00:00:00.000Z");
    expect(on("2026-05-31T18:00:00Z", 1)).toBe("2026-06-30T18:00:00.000Z");
    expect(on("2026-03-31T12:00:00Z", -1)).toBe("2026-02-28T12:00:00.000Z");
    expect(on("2026-02-28T00:00:00Z", 0)).toBe("2026-02-28T00:00:00.000Z");
  });

  it("goes across a year's end either way, and by a year", () => {
    expect(on("2026-12-31T00:00:00Z", 2)).toBe("2027-02-28T00:00:00.000Z");
    expect(on("2026-01-10T00:00:00Z", -1)).toBe("2025-12-10T00:00:00.000Z");
    expect(on("2028-02-29T00:00:00Z", 12)).toBe("2029-02-28T00:00:00.000Z");
    // Years before 100 are taken as they are, not as 1900 to 1999.
    expect(on("0050-01-31T00:00:00Z", 1)).toBe("0050-02-28T00:00:00.000Z");
  });

  describe("in local time in New York", () => {
    inZone("America/New_York");

    it("keeps the clock's time across daylight saving, and puts a time the clocks skip after the change", () => {
      // 9 AM on 15 February is 9 AM on 15 March: an hour less apart, since the clocks went forward.
      expect(on("2026-02-15T14:00:00Z", 1, "local")).toBe("2026-03-15T13:00:00.000Z");
      expect(on("2026-02-15T14:00:00Z", 1)).toBe("2026-03-15T14:00:00.000Z");
      // 2:30 AM on 8 February: on 8 March the clocks skip from 2 to 3 AM, so it's 3:30.
      expect(on("2026-02-08T07:30:00Z", 1, "local")).toBe("2026-03-08T07:30:00.000Z");
    });

    it("ends the zone's month on its last day: 10 PM on 30 January is 31 January in UTC", () => {
      expect(on("2026-01-31T03:00:00Z", 1, "local")).toBe("2026-03-01T03:00:00.000Z");
      expect(on("2026-01-31T03:00:00Z", 1)).toBe("2026-02-28T03:00:00.000Z");
    });
  });

  describe("in local time in Auckland", () => {
    inZone("Pacific/Auckland");

    it("ends the zone's month on its last day: 1 AM on 31 January is 30 January in UTC", () => {
      expect(on("2026-01-30T12:00:00Z", 1, "local")).toBe("2026-02-27T12:00:00.000Z");
      expect(on("2026-01-30T12:00:00Z", 1)).toBe("2026-02-28T12:00:00.000Z");
    });
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

describe("isTimeZone", () => {
  it('takes "UTC", "local" and any name Intl.DateTimeFormat takes, in any case, and nothing else', () => {
    for (const zone of ["UTC", "local", "Europe/London", "europe/london", "Etc/UTC", "Asia/Calcutta"]) expect(isTimeZone(zone), zone).toBe(true);
    for (const zone of ["Mars/Olympus_Mons", "Europe/Londres", "", "Local", 0, null, undefined, {}]) expect(isTimeZone(zone), String(zone)).toBe(false);
  });
});

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** `n` ISO times from `from`, `step` ms apart. */
const every = (from: string, n: number, step: number): string[] => Array.from({ length: n }, (_, i) => iso(ms(from) + i * step));

/** Each time said as the chart says it, for all of them together. */
function names(times: readonly string[], zone: TimeZone): string[] {
  const say = timeName(times.map(ms), zone);
  return times.map((t) => plain(say(ms(t))));
}

const monthOn = (t: string, months: number, zone: TimeZone): string => iso(monthsOn(ms(t), months, zone));

/**
 * A zone by its name, read through Intl: ticks at the steps from minutes to years, names, and a month
 * on and back, across its clock changes in 2026. Called with the viewer's clock in three zones below,
 * since none of it may follow the viewer's clock.
 */
function byName(): void {
  it("Europe/London: ticks on London's own boundaries through both of 2026's changes", () => {
    const london = (lo: string, hi: string): string[] => ticks(lo, hi, "Europe/London");
    // Minutes as the clocks go back from 2 AM BST to 1 AM GMT on 25 October: 1:00 comes again.
    expect(london("2026-10-25T00:50:00Z", "2026-10-25T01:35:00Z")).toEqual([
      "2026-10-25T00:50:00.000Z 1:50 AM",
      "2026-10-25T01:00:00.000Z 1:00 AM",
      "2026-10-25T01:15:00.000Z 1:15 AM",
      "2026-10-25T01:30:00.000Z 1:30 AM",
      "2026-10-25T01:35:00.000Z 1:35 AM"
    ]);
    // Hours: 1 AM twice.
    expect(london("2026-10-24T23:30:00Z", "2026-10-25T02:30:00Z")).toEqual([
      "2026-10-24T23:30:00.000Z 12:30 AM",
      "2026-10-25T00:00:00.000Z 1:00 AM",
      "2026-10-25T01:00:00.000Z 1:00 AM",
      "2026-10-25T02:00:00.000Z 2:00 AM",
      "2026-10-25T02:30:00.000Z 2:30 AM"
    ]);
    // And on 29 March, when they go forward at 1 AM GMT: 3 AM comes an hour after midnight.
    expect(london("2026-03-28T22:00:00Z", "2026-03-29T05:00:00Z")).toEqual([
      "2026-03-28T22:00:00.000Z Mar 28, 10:00 PM",
      "2026-03-29T00:00:00.000Z Mar 29",
      "2026-03-29T02:00:00.000Z 3:00 AM",
      "2026-03-29T05:00:00.000Z Mar 29, 6:00 AM"
    ]);
    // Days at London's midnights, 11 PM in UTC in summer: 25 October has 25 hours.
    expect(london("2026-10-22T23:00:00Z", "2026-10-27T00:00:00Z")).toEqual([
      "2026-10-22T23:00:00.000Z Oct 23",
      "2026-10-23T23:00:00.000Z Oct 24",
      "2026-10-24T23:00:00.000Z Oct 25",
      "2026-10-26T00:00:00.000Z Oct 26",
      "2026-10-27T00:00:00.000Z Oct 27"
    ]);
    // Weeks from Monday, and the end an hour after midnight once it's summer time.
    expect(london("2026-03-10T00:00:00Z", "2026-03-31T00:00:00Z")).toEqual([
      "2026-03-10T00:00:00.000Z Mar 10",
      "2026-03-16T00:00:00.000Z Mar 16",
      "2026-03-23T00:00:00.000Z Mar 23",
      "2026-03-29T23:00:00.000Z Mar 30",
      "2026-03-31T00:00:00.000Z Mar 31, 1:00 AM"
    ]);
    expect(london("2026-02-15T00:00:00Z", "2026-06-15T00:00:00Z")).toEqual([
      "2026-02-15T00:00:00.000Z Feb 15",
      "2026-03-01T00:00:00.000Z Mar",
      "2026-03-31T23:00:00.000Z Apr",
      "2026-04-30T23:00:00.000Z May",
      "2026-05-31T23:00:00.000Z Jun",
      "2026-06-15T00:00:00.000Z Jun 15, 1:00 AM"
    ]);
    expect(london("2016-07-01T00:00:00Z", "2026-07-01T00:00:00Z")).toEqual([
      "2016-07-01T00:00:00.000Z Jul 1, 2016, 1:00 AM",
      "2020-01-01T00:00:00.000Z 2020",
      "2025-01-01T00:00:00.000Z 2025",
      "2026-07-01T00:00:00.000Z Jul 1, 2026, 1:00 AM"
    ]);
  });

  it("Europe/London: says times in London, a time that comes twice with the zone's short name", () => {
    // Hour by hour as the clocks go back, and in quarter hours.
    expect(names(every("2026-10-24T23:00:00Z", 5, HOUR), "Europe/London")).toEqual([
      "Oct 25, 2026, 12:00 AM",
      "Oct 25, 2026, 1:00 AM GMT+1",
      "Oct 25, 2026, 1:00 AM GMT",
      "Oct 25, 2026, 2:00 AM",
      "Oct 25, 2026, 3:00 AM"
    ]);
    expect(names(every("2026-10-24T23:45:00Z", 10, 15 * MINUTE), "Europe/London")).toEqual([
      "Oct 25, 2026, 12:45 AM",
      "Oct 25, 2026, 1:00 AM GMT+1",
      "Oct 25, 2026, 1:15 AM GMT+1",
      "Oct 25, 2026, 1:30 AM GMT+1",
      "Oct 25, 2026, 1:45 AM GMT+1",
      "Oct 25, 2026, 1:00 AM GMT",
      "Oct 25, 2026, 1:15 AM GMT",
      "Oct 25, 2026, 1:30 AM GMT",
      "Oct 25, 2026, 1:45 AM GMT",
      "Oct 25, 2026, 2:00 AM"
    ]);
    // A time that comes twice says so even when the other isn't an x.
    expect(names(["2026-10-24T00:00:00Z", "2026-10-25T00:00:00Z", "2026-10-26T00:00:00Z"], "Europe/London")).toEqual([
      "Oct 24, 2026, 1:00 AM",
      "Oct 25, 2026, 1:00 AM GMT+1",
      "Oct 26, 2026, 12:00 AM"
    ]);
    // London's midnights are days; a date alone needs no zone.
    expect(names(["2026-10-23T23:00:00Z", "2026-10-24T23:00:00Z", "2026-10-26T00:00:00Z"], "Europe/London")).toEqual(["Oct 24, 2026", "Oct 25, 2026", "Oct 26, 2026"]);
    useLocale("en-GB");
    expect(names(every("2026-10-24T23:00:00Z", 5, HOUR), "Europe/London")).toEqual([
      "25 Oct 2026, 00:00",
      "25 Oct 2026, 01:00 BST",
      "25 Oct 2026, 01:00 GMT",
      "25 Oct 2026, 02:00",
      "25 Oct 2026, 03:00"
    ]);
  });

  it("Europe/London: goes a month on or back by London's calendar and clock", () => {
    expect(monthOn("2026-02-28T01:30:00Z", 1, "Europe/London")).toBe("2026-03-28T01:30:00.000Z");
    // Noon is noon: an hour less apart, as the clocks went forward.
    expect(monthOn("2026-03-15T12:00:00Z", 1, "Europe/London")).toBe("2026-04-15T11:00:00.000Z");
    // 1:30 AM on 29 March is skipped, so it's 2:30 BST.
    expect(monthOn("2026-01-29T01:30:00Z", 2, "Europe/London")).toBe("2026-03-29T01:30:00.000Z");
    // 1:30 AM on 25 October comes twice: the first, in BST, either way.
    expect(monthOn("2026-09-25T00:30:00Z", 1, "Europe/London")).toBe("2026-10-25T00:30:00.000Z");
    expect(monthOn("2026-11-25T01:30:00Z", -1, "Europe/London")).toBe("2026-10-25T00:30:00.000Z");
    // 11 PM on 31 May in London, three months back, is 28 February's last hour there.
    expect(monthOn("2026-05-31T22:00:00Z", -3, "Europe/London")).toBe("2026-02-28T23:00:00.000Z");
  });

  it("America/New_York: as local time there, with its own short names", () => {
    const york = (lo: string, hi: string): string[] => ticks(lo, hi, "America/New_York");
    expect(york("2026-03-08T03:00:00Z", "2026-03-08T14:00:00Z")).toEqual([
      "2026-03-08T03:00:00.000Z Mar 7, 10:00 PM",
      "2026-03-08T05:00:00.000Z Mar 8",
      "2026-03-08T07:00:00.000Z 3:00 AM",
      "2026-03-08T10:00:00.000Z 6:00 AM",
      "2026-03-08T13:00:00.000Z 9:00 AM",
      "2026-03-08T14:00:00.000Z Mar 8, 10:00 AM"
    ]);
    expect(york("2026-11-01T05:40:00Z", "2026-11-01T06:25:00Z")).toEqual([
      "2026-11-01T05:40:00.000Z 1:40 AM",
      "2026-11-01T05:45:00.000Z 1:45 AM",
      "2026-11-01T06:00:00.000Z 1:00 AM",
      "2026-11-01T06:15:00.000Z 1:15 AM",
      "2026-11-01T06:25:00.000Z 1:25 AM"
    ]);
    expect(york("2026-10-30T04:00:00Z", "2026-11-02T05:00:00Z")).toEqual([
      "2026-10-30T04:00:00.000Z Oct 30",
      "2026-10-31T04:00:00.000Z Oct 31",
      "2026-11-01T04:00:00.000Z Nov",
      "2026-11-02T05:00:00.000Z Nov 2"
    ]);
    expect(york("2026-02-03T05:00:00Z", "2026-02-24T05:00:00Z")).toEqual([
      "2026-02-03T05:00:00.000Z Feb 3",
      "2026-02-09T05:00:00.000Z Feb 9",
      "2026-02-16T05:00:00.000Z Feb 16",
      "2026-02-23T05:00:00.000Z Feb 23",
      "2026-02-24T05:00:00.000Z Feb 24"
    ]);
    expect(boundaries(ms("2026-01-15T05:00:00Z"), ms("2026-05-15T04:00:00Z"), { unit: "month", count: 1 }, "America/New_York").map(iso)).toEqual([
      "2026-02-01T05:00:00.000Z",
      "2026-03-01T05:00:00.000Z",
      "2026-04-01T04:00:00.000Z",
      "2026-05-01T04:00:00.000Z"
    ]);
    expect(york("2020-01-01T05:00:00Z", "2030-06-15T04:00:00Z")).toEqual([
      "2020-01-01T05:00:00.000Z 2020",
      "2025-01-01T05:00:00.000Z 2025",
      "2030-01-01T05:00:00.000Z 2030",
      "2030-06-15T04:00:00.000Z Jun 15, 2030"
    ]);
    expect(names(every("2026-11-01T04:00:00Z", 5, HOUR), "America/New_York")).toEqual([
      "Nov 1, 2026, 12:00 AM",
      "Nov 1, 2026, 1:00 AM EDT",
      "Nov 1, 2026, 1:00 AM EST",
      "Nov 1, 2026, 2:00 AM",
      "Nov 1, 2026, 3:00 AM"
    ]);
    expect(monthOn("2026-02-15T14:00:00Z", 1, "America/New_York")).toBe("2026-03-15T13:00:00.000Z");
    expect(monthOn("2026-02-08T07:30:00Z", 1, "America/New_York")).toBe("2026-03-08T07:30:00.000Z");
    expect(monthOn("2026-01-31T03:00:00Z", 1, "America/New_York")).toBe("2026-03-01T03:00:00.000Z");
  });

  it("Australia/Lord_Howe: on the hour through its half-hour changes, the half hour that comes twice named", () => {
    const howe = (lo: string, hi: string): string[] => ticks(lo, hi, "Australia/Lord_Howe");
    // 5 April: at 2 AM the clocks go back to 1:30.
    expect(howe("2026-04-04T13:00:00Z", "2026-04-04T17:00:00Z")).toEqual([
      "2026-04-04T13:00:00.000Z Apr 5",
      "2026-04-04T14:00:00.000Z 1:00 AM",
      "2026-04-04T15:30:00.000Z 2:00 AM",
      "2026-04-04T16:30:00.000Z 3:00 AM",
      "2026-04-04T17:00:00.000Z 3:30 AM"
    ]);
    expect(howe("2026-04-04T14:20:00Z", "2026-04-04T15:10:00Z")).toEqual([
      "2026-04-04T14:20:00.000Z 1:20 AM",
      "2026-04-04T14:30:00.000Z 1:30 AM",
      "2026-04-04T14:45:00.000Z 1:45 AM",
      "2026-04-04T15:00:00.000Z 1:30 AM",
      "2026-04-04T15:10:00.000Z 1:40 AM"
    ]);
    // 4 October: at 2 AM they go forward to 2:30, so there's no 2 AM.
    expect(howe("2026-10-03T13:30:00Z", "2026-10-03T17:00:00Z")).toEqual([
      "2026-10-03T13:30:00.000Z Oct 4",
      "2026-10-03T14:30:00.000Z 1:00 AM",
      "2026-10-03T16:00:00.000Z 3:00 AM",
      "2026-10-03T17:00:00.000Z 4:00 AM"
    ]);
    // Midnight is 1 PM in UTC in summer, and 1:30 PM after.
    expect(howe("2026-04-01T13:00:00Z", "2026-04-05T13:30:00Z")).toEqual([
      "2026-04-01T13:00:00.000Z Apr 2",
      "2026-04-02T13:00:00.000Z Apr 3",
      "2026-04-03T13:00:00.000Z Apr 4",
      "2026-04-04T13:00:00.000Z Apr 5",
      "2026-04-05T13:30:00.000Z Apr 6"
    ]);
    expect(names(every("2026-04-04T14:15:00Z", 6, 15 * MINUTE), "Australia/Lord_Howe")).toEqual([
      "Apr 5, 2026, 1:15 AM",
      "Apr 5, 2026, 1:30 AM GMT+11",
      "Apr 5, 2026, 1:45 AM GMT+11",
      "Apr 5, 2026, 1:30 AM GMT+10:30",
      "Apr 5, 2026, 1:45 AM GMT+10:30",
      "Apr 5, 2026, 2:00 AM"
    ]);
    // 1:45 AM on 5 April comes twice: the first. 2:10 AM on 4 October is skipped: it's 2:40.
    expect(monthOn("2026-03-04T14:45:00Z", 1, "Australia/Lord_Howe")).toBe("2026-04-04T14:45:00.000Z");
    expect(monthOn("2026-09-03T15:40:00Z", 1, "Australia/Lord_Howe")).toBe("2026-10-03T15:40:00.000Z");
  });

  it("Asia/Kolkata: five and a half hours ahead all year", () => {
    const kolkata = (lo: string, hi: string): string[] => ticks(lo, hi, "Asia/Kolkata");
    expect(kolkata("2026-01-05T00:07:00Z", "2026-01-05T00:52:00Z")).toEqual([
      "2026-01-05T00:07:00.000Z 5:37 AM",
      "2026-01-05T00:15:00.000Z 5:45 AM",
      "2026-01-05T00:30:00.000Z 6:00 AM",
      "2026-01-05T00:45:00.000Z 6:15 AM",
      "2026-01-05T00:52:00.000Z 6:22 AM"
    ]);
    expect(kolkata("2026-01-05T00:00:00Z", "2026-01-05T22:00:00Z")).toEqual([
      "2026-01-05T00:00:00.000Z Jan 5, 5:30 AM",
      "2026-01-05T00:30:00.000Z 6:00 AM",
      "2026-01-05T06:30:00.000Z 12:00 PM",
      "2026-01-05T12:30:00.000Z 6:00 PM",
      "2026-01-05T18:30:00.000Z Jan 6",
      "2026-01-05T22:00:00.000Z Jan 6, 3:30 AM"
    ]);
    expect(kolkata("2026-01-04T18:30:00Z", "2026-01-08T18:30:00Z")).toEqual([
      "2026-01-04T18:30:00.000Z Jan 5",
      "2026-01-05T18:30:00.000Z Jan 6",
      "2026-01-06T18:30:00.000Z Jan 7",
      "2026-01-07T18:30:00.000Z Jan 8",
      "2026-01-08T18:30:00.000Z Jan 9"
    ]);
    expect(kolkata("2026-02-03T00:00:00Z", "2026-02-24T00:00:00Z")).toEqual([
      "2026-02-03T00:00:00.000Z Feb 3, 5:30 AM",
      "2026-02-08T18:30:00.000Z Feb 9",
      "2026-02-15T18:30:00.000Z Feb 16",
      "2026-02-22T18:30:00.000Z Feb 23",
      "2026-02-24T00:00:00.000Z Feb 24, 5:30 AM"
    ]);
    expect(kolkata("2026-02-15T00:00:00Z", "2026-06-15T00:00:00Z")).toEqual([
      "2026-02-15T00:00:00.000Z Feb 15, 5:30 AM",
      "2026-02-28T18:30:00.000Z Mar",
      "2026-03-31T18:30:00.000Z Apr",
      "2026-04-30T18:30:00.000Z May",
      "2026-05-31T18:30:00.000Z Jun",
      "2026-06-15T00:00:00.000Z Jun 15, 5:30 AM"
    ]);
    expect(kolkata("2020-03-01T00:00:00Z", "2030-01-01T00:00:00Z")).toEqual([
      "2020-03-01T00:00:00.000Z Mar 1, 2020, 5:30 AM",
      "2024-12-31T18:30:00.000Z 2025",
      "2029-12-31T18:30:00.000Z 2030",
      "2030-01-01T00:00:00.000Z Jan 1, 2030, 5:30 AM"
    ]);
    expect(names(["2026-01-05T00:00:00Z", "2026-01-05T18:30:00Z", "2026-01-05T18:30:15Z"], "Asia/Kolkata")).toEqual([
      "Jan 5, 2026, 5:30:00 AM",
      "Jan 6, 2026, 12:00:00 AM",
      "Jan 6, 2026, 12:00:15 AM"
    ]);
    // 1:30 AM on 31 January there, a month on, is 28 February's.
    expect(monthOn("2026-01-30T20:00:00Z", 1, "Asia/Kolkata")).toBe("2026-02-27T20:00:00.000Z");
    expect(monthOn("2026-03-31T18:30:00Z", -1, "Asia/Kolkata")).toBe("2026-02-28T18:30:00.000Z");
  });

  it("Pacific/Chatham: 12:45 ahead, 13:45 in summer, so its hours are a quarter past in UTC", () => {
    const chatham = (lo: string, hi: string): string[] => ticks(lo, hi, "Pacific/Chatham");
    // 5 April: at 3:45 AM the clocks go back to 2:45.
    expect(chatham("2026-04-04T13:40:00Z", "2026-04-04T14:25:00Z")).toEqual([
      "2026-04-04T13:40:00.000Z 3:25 AM",
      "2026-04-04T13:45:00.000Z 3:30 AM",
      "2026-04-04T14:00:00.000Z 2:45 AM",
      "2026-04-04T14:15:00.000Z 3:00 AM",
      "2026-04-04T14:25:00.000Z 3:10 AM"
    ]);
    expect(chatham("2026-04-04T11:15:00Z", "2026-04-04T16:15:00Z")).toEqual([
      "2026-04-04T11:15:00.000Z 1:00 AM",
      "2026-04-04T13:15:00.000Z 3:00 AM",
      "2026-04-04T14:15:00.000Z 3:00 AM",
      "2026-04-04T16:15:00.000Z 5:00 AM"
    ]);
    expect(chatham("2026-04-02T10:15:00Z", "2026-04-06T11:15:00Z")).toEqual([
      "2026-04-02T10:15:00.000Z Apr 3",
      "2026-04-03T10:15:00.000Z Apr 4",
      "2026-04-04T10:15:00.000Z Apr 5",
      "2026-04-05T11:15:00.000Z Apr 6",
      "2026-04-06T11:15:00.000Z Apr 7"
    ]);
    expect(chatham("2026-01-15T00:00:00Z", "2026-12-15T00:00:00Z")).toEqual([
      "2026-01-15T00:00:00.000Z Jan 15, 1:45 PM",
      "2026-03-31T10:15:00.000Z Apr",
      "2026-06-30T11:15:00.000Z Jul",
      "2026-09-30T10:15:00.000Z Oct",
      "2026-12-15T00:00:00.000Z Dec 15, 1:45 PM"
    ]);
    expect(names(every("2026-04-04T13:15:00Z", 4, 30 * MINUTE), "Pacific/Chatham")).toEqual([
      "Apr 5, 2026, 3:00 AM GMT+13:45",
      "Apr 5, 2026, 3:30 AM GMT+13:45",
      "Apr 5, 2026, 3:00 AM GMT+12:45",
      "Apr 5, 2026, 3:30 AM GMT+12:45"
    ]);
    expect(monthOn("2026-03-04T13:30:00Z", 1, "Pacific/Chatham")).toBe("2026-04-04T13:30:00.000Z");
    expect(monthOn("2026-01-30T11:30:00Z", 1, "Pacific/Chatham")).toBe("2026-02-27T11:30:00.000Z");
  });

  it("America/Santiago: a day whose midnight the clocks skip starts at 1 AM, and 11 PM comes twice the night they go back", () => {
    const santiago = (lo: string, hi: string): string[] => ticks(lo, hi, "America/Santiago");
    // 6 September: at midnight the clocks go forward to 1 AM, so the day's tick is at the first time it has.
    expect(santiago("2026-09-04T04:00:00Z", "2026-09-08T03:00:00Z")).toEqual([
      "2026-09-04T04:00:00.000Z Sep 4",
      "2026-09-05T04:00:00.000Z Sep 5",
      "2026-09-06T04:00:00.000Z 1:00 AM",
      "2026-09-07T03:00:00.000Z Sep 7",
      "2026-09-08T03:00:00.000Z Sep 8"
    ]);
    expect(santiago("2026-09-05T23:00:00Z", "2026-09-06T08:00:00Z")).toEqual([
      "2026-09-05T23:00:00.000Z Sep 5, 7:00 PM",
      "2026-09-06T01:00:00.000Z 9:00 PM",
      "2026-09-06T06:00:00.000Z 3:00 AM",
      "2026-09-06T08:00:00.000Z Sep 6, 5:00 AM"
    ]);
    // 4 April: at midnight they go back to 11 PM.
    expect(santiago("2026-04-05T01:40:00Z", "2026-04-05T03:25:00Z")).toEqual([
      "2026-04-05T01:40:00.000Z 10:40 PM",
      "2026-04-05T02:00:00.000Z 11:00 PM",
      "2026-04-05T02:30:00.000Z 11:30 PM",
      "2026-04-05T03:00:00.000Z 11:00 PM",
      "2026-04-05T03:25:00.000Z 11:25 PM"
    ]);
    expect(santiago("2026-08-01T04:00:00Z", "2026-11-28T03:00:00Z")).toEqual([
      "2026-08-01T04:00:00.000Z Aug",
      "2026-09-01T04:00:00.000Z Sep",
      "2026-10-01T03:00:00.000Z Oct",
      "2026-11-01T03:00:00.000Z Nov",
      "2026-11-28T03:00:00.000Z Nov 28"
    ]);
    expect(names(every("2026-04-05T01:00:00Z", 4, HOUR), "America/Santiago")).toEqual([
      "Apr 4, 2026, 10:00 PM",
      "Apr 4, 2026, 11:00 PM GMT-3",
      "Apr 4, 2026, 11:00 PM GMT-4",
      "Apr 5, 2026, 12:00 AM"
    ]);
    // 12:30 AM on 6 September is skipped: it's 1:30. 11:30 PM on 4 April comes twice: the first.
    expect(monthOn("2026-08-06T04:30:00Z", 1, "America/Santiago")).toBe("2026-09-06T04:30:00.000Z");
    expect(monthOn("2026-03-05T02:30:00Z", 1, "America/Santiago")).toBe("2026-04-05T02:30:00.000Z");
  });
}

describe("a zone by its name", () => {
  byName();

  describe("with the viewer's clock in Berlin, which changes when London's does", () => {
    inZone("Europe/Berlin");
    byName();
  });

  describe("with the viewer's clock in Auckland", () => {
    inZone("Pacific/Auckland");
    byName();
  });
});

/** 2026's clock changes in each zone. Kolkata's clocks don't change. */
const CHANGES: Readonly<Record<string, readonly string[]>> = {
  "Europe/London": ["2026-03-29T01:00:00Z", "2026-10-25T01:00:00Z"],
  "America/New_York": ["2026-03-08T07:00:00Z", "2026-11-01T06:00:00Z"],
  "Australia/Lord_Howe": ["2026-04-04T15:00:00Z", "2026-10-03T15:30:00Z"],
  "Asia/Kolkata": [],
  "Pacific/Chatham": ["2026-04-04T14:00:00Z", "2026-09-26T14:00:00Z"],
  "America/Santiago": ["2026-04-05T03:00:00Z", "2026-09-06T04:00:00Z"]
};

/** Spans of each step, from 45 seconds to ten years. */
const SPANS = [45_000, 40 * MINUTE, 2 * HOUR, 7 * HOUR, 22 * HOUR, 4 * DAY, 21 * DAY, 90 * DAY, 365 * DAY, 3650 * DAY];

/** Ranges of each span around each of the zone's changes and 1 July, centred and off centre. */
function ranges(zone: string): [number, number][] {
  return [...CHANGES[zone]!, "2026-07-01T00:00:00Z"].flatMap((change) =>
    SPANS.flatMap((span): [number, number][] => [
      [ms(change) - span / 2, ms(change) + span / 2],
      [ms(change) - span * 0.3 + 7 * MINUTE, ms(change) + span * 0.7 + 7 * MINUTE]
    ])
  );
}

/** 21 times evenly from `lo` to `hi`, to the ms. */
const across = (lo: number, hi: number): number[] => Array.from({ length: 21 }, (_, i) => Math.round(lo + ((hi - lo) * i) / 20));

describe("a zone by its name, against Date's local time there", () => {
  for (const zone of Object.keys(CHANGES)) {
    describe(zone, () => {
      inZone(zone);

      it("ticks, says times and goes a month on as local time does there, at every step", () => {
        for (const [lo, hi] of ranges(zone)) {
          expect(timeTicks(lo, hi, zone), `${iso(lo)} to ${iso(hi)}`).toEqual(timeTicks(lo, hi, "local"));
          const times = across(lo, hi).map(iso);
          expect(names(times, zone)).toEqual(names(times, "local"));
        }
        for (let t = ms("2026-01-01T03:00:00Z"); t < ms("2027-01-01T00:00:00Z"); t += 31 * HOUR + 7 * MINUTE) {
          for (const months of [1, -1, 2, -13]) expect(monthsOn(t, months, zone), `${iso(t)} ${months}`).toBe(monthsOn(t, months, "local"));
        }
      });

      it("says no two times alike where the clocks go back, hour by hour and minute by minute, by its name and in local time", () => {
        for (const change of CHANGES[zone]!) {
          for (const [step, n] of [
            [HOUR, 13],
            [MINUTE, 181]
          ] as const) {
            const times = Array.from({ length: n }, (_, i) => iso(ms(change) - ((n - 1) / 2) * step + i * step));
            for (const said of [names(times, zone), names(times, "local")]) expect(new Set(said).size, `${change} every ${step / MINUTE} min`).toBe(n);
          }
        }
      });
    });
  }
});

/** A 64-bit hash of the text (cyrb53's mixing, both halves kept), as 16 hex digits, as line.test.ts has it. */
function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}

/** What main (2d84d47) said, as "ticks, says times and goes a month on as main does" hashes it there. */
const MAIN = { utc: "b68bb096f1960795", local: "7e98e139c5f5577b" } as const;

describe("UTC and local time, byte for byte as on main", () => {
  inZone("America/New_York");

  /**
   * Every tick, name and month on, for ranges of each span around New York's clock changes, hashed.
   * Main said a time that comes twice with no zone; now it adds the zone's short name, which is dropped here.
   */
  function digest(zone: TimeZone): string {
    const lines: string[] = [];
    for (const [lo, hi] of ranges("America/New_York")) {
      lines.push(...timeTicks(lo, hi, zone).map((tick) => `${tick.value} ${plain(tick.text)}`));
      const times = across(lo, hi);
      const say = timeName(times, zone);
      lines.push(...times.map((t) => plain(say(t)).replace(/ E[DS]T$/, "")));
    }
    for (let t = ms("2026-01-01T03:00:00Z"); t < ms("2027-01-01T00:00:00Z"); t += 31 * HOUR + 7 * MINUTE) {
      for (const months of [1, -1, 2, -13]) lines.push(String(monthsOn(t, months, zone)));
    }
    return hash(lines.join("\n"));
  }

  it("ticks, says times and goes a month on as main does, and Etc/UTC as UTC", () => {
    expect(digest("UTC")).toBe(MAIN.utc);
    expect(digest("local")).toBe(MAIN.local);
    expect(digest("Etc/UTC")).toBe(MAIN.utc);
  });

  it("names a time that comes twice in local time, as it does in a zone by its name, and never in UTC", () => {
    expect(names(every("2026-11-01T04:00:00Z", 5, HOUR), "local")).toEqual([
      "Nov 1, 2026, 12:00 AM",
      "Nov 1, 2026, 1:00 AM EDT",
      "Nov 1, 2026, 1:00 AM EST",
      "Nov 1, 2026, 2:00 AM",
      "Nov 1, 2026, 3:00 AM"
    ]);
    expect(names(every("2026-11-01T04:00:00Z", 5, HOUR), "UTC")).toEqual(["Nov 1, 2026, 4:00 AM", "Nov 1, 2026, 5:00 AM", "Nov 1, 2026, 6:00 AM", "Nov 1, 2026, 7:00 AM", "Nov 1, 2026, 8:00 AM"]);
  });
});
