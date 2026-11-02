// Time on the line chart's x: the steps between ticks, where ticks fall, and how a time is worded.
// Pure, and with no dependency: in UTC and local time, boundaries are found with Date's own UTC or
// local getters and setters, which handle daylight saving; a zone's name is read through
// Intl.DateTimeFormat, so no zone data ships. Times are worded through Intl.DateTimeFormat in the
// page's locale. A time is in ms, as Date.getTime() gives it.

import { niceStep } from "./bar-layout";

/** The zone a time axis is in: UTC, the viewer's clock, or a zone's name as Intl knows it ("Europe/London"). Named as Intl's option is. */
export type TimeZone = "UTC" | "local" | (string & {});

/** How fine a time is: the coarsest boundary it falls on in its zone. Midnight on 1 January is a year. */
export type TimeLevel = "year" | "month" | "day" | "hour" | "minute" | "second" | "millisecond";

type Unit = "second" | "minute" | "hour" | "day" | "week" | "month" | "year";

/** A step between ticks: `count` of a unit, on that unit's boundaries. */
export interface TimeStep {
  readonly unit: Unit;
  readonly count: number;
}

/** An x tick on a time axis: where it is, and its text. */
export interface TimeTick {
  readonly value: number;
  readonly text: string;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Each unit at its longest, for choosing a step (never for placing a tick): a day of 25 hours when
 * the clocks go back, a month of 31 days, a year of 366. So a range of whole months or years gets
 * the step that fits it, whatever its leap days and clock changes.
 */
const LONGEST: Readonly<Record<Unit, number>> = { second: SECOND, minute: MINUTE, hour: HOUR, day: DAY + HOUR, week: 7 * DAY + HOUR, month: 31 * DAY, year: 366 * DAY };

/** The steps shorter than a year, in order. Years go on in the number axis's nice steps. Built in a call marked pure, so a page with no time axis leaves it out. */
const STEPS: readonly TimeStep[] = /* @__PURE__ */ (() => [
  ...[1, 5, 15, 30].map((count) => ({ unit: "second" as const, count })),
  ...[1, 5, 15, 30].map((count) => ({ unit: "minute" as const, count })),
  ...[1, 3, 6, 12].map((count) => ({ unit: "hour" as const, count })),
  { unit: "day", count: 1 },
  { unit: "day", count: 2 },
  { unit: "week", count: 1 },
  { unit: "month", count: 1 },
  { unit: "month", count: 3 }
])();

/** From the coarsest. */
const LEVELS: readonly TimeLevel[] = ["year", "month", "day", "hour", "minute", "second", "millisecond"];

/** The level a step's boundaries are at, at least: a week starts on a day. */
const UNIT_LEVEL: Readonly<Record<Unit, TimeLevel>> = { second: "second", minute: "minute", hour: "hour", day: "day", week: "day", month: "month", year: "year" };

/** Milliseconds, as a fraction of a second ("1:00:00.100 PM"). ES2021's option, so it isn't in this build's lib. */
const FRACTION = { fractionalSecondDigits: 3 } as Intl.DateTimeFormatOptions;

/** What a time at each level says: the year on a year, the month on a month ("Feb"), the day on a day ("Feb 8"), the time within a day. */
const FIELDS: Readonly<Record<TimeLevel, Intl.DateTimeFormatOptions>> = {
  year: { year: "numeric" },
  month: { month: "short" },
  day: { month: "short", day: "numeric" },
  hour: { hour: "numeric", minute: "2-digit" },
  minute: { hour: "numeric", minute: "2-digit" },
  second: { hour: "numeric", minute: "2-digit", second: "2-digit" },
  millisecond: { hour: "numeric", minute: "2-digit", second: "2-digit", ...FRACTION }
};

/** Whether a time axis takes the zone: "UTC", "local", or a name Intl.DateTimeFormat takes as its timeZone. */
export function isTimeZone(zone: unknown): zone is TimeZone {
  if (zone === "UTC" || zone === "local") return true;
  if (typeof zone !== "string") return false;
  try {
    clockOf(zone);
    return true;
  } catch {
    return false;
  }
}

/** The smallest step that can be `span` ms long, as the number axis rounds its step up. */
export function timeStep(span: number): TimeStep {
  for (const step of STEPS) if (LONGEST[step.unit] * step.count >= span) return step;
  return { unit: "year", count: Math.max(1, niceStep(span / LONGEST.year)) };
}

/**
 * The x ticks for times from `lo` to `hi`: both ends, and the boundaries strictly between them at a
 * step of about a quarter of the range (the smallest that can be that long, as on a number axis), each
 * on its boundary in the zone (a day at midnight, a month on its first). Each is worded for its own
 * level: "2026", "Feb", "Feb 8" ("8 Feb" in en-GB), "3:00 PM". The ends needn't be on a boundary, so
 * each also says the levels up to the step's and up to the coarsest the axis crosses, to be placed
 * even when the ticks between are dropped for room: "Jan 5, 2026" on an axis of years, or of months
 * into the next year; "Feb 5, 3:00 PM" on one of hours past midnight. A lone time says everything up
 * to its year.
 */
export function timeTicks(lo: number, hi: number, zone: TimeZone): TimeTick[] {
  const word = tickWording(zone);
  if (!(hi > lo)) return [{ value: lo, text: word(lo, "year") }];
  const step = timeStep((hi - lo) / 4);
  const ends = LEVELS[Math.min(LEVELS.indexOf(UNIT_LEVEL[step.unit]), LEVELS.indexOf(crossed(lo, hi, zone)))]!;
  const between = boundaries(lo, hi, step, zone).map((value) => ({ value, text: word(value, "millisecond") }));
  return [{ value: lo, text: word(lo, ends) }, ...between, { value: hi, text: word(hi, ends) }];
}

/** The coarsest boundary between `lo` and `hi`: the first of their fields that differs, from the year down. */
function crossed(lo: number, hi: number, zone: TimeZone): TimeLevel {
  const [a, b] = [partsOf(lo, zone), partsOf(hi, zone)];
  if (a.year !== b.year) return "year";
  if (a.month !== b.month) return "month";
  if (a.date !== b.date) return "day";
  if (a.hours !== b.hours) return "hour";
  return a.minutes !== b.minutes ? "minute" : "second";
}

/** The step's boundaries strictly between `lo` and `hi`, in the zone, in order. */
export function boundaries(lo: number, hi: number, step: TimeStep, zone: TimeZone): number[] {
  const { unit, count } = step;
  const out: number[] = [];
  const start = partsOf(lo, zone);
  if (unit === "second" || unit === "minute" || unit === "hour") {
    // Whole units by the zone's clock, found by stepping through elapsed time and kept where the clock
    // shows a whole unit whose field is a multiple of `count`: an hour the clocks repeat has a tick each
    // time, and one they skip has none. Hours are stepped a quarter of an hour at a time, since clocks
    // change by whole quarter hours (Lord Howe Island's by half an hour), so a tick after the change is
    // still on the hour.
    const grain = unit === "hour" ? 15 * MINUTE : LONGEST[unit];
    let t = lo - start.ms - (unit === "second" ? 0 : start.seconds * SECOND) - (unit === "hour" ? (start.minutes % 15) * MINUTE : 0);
    for (; t < hi; t += grain) {
      const parts = partsOf(t, zone);
      const whole = unit !== "hour" || parts.minutes === 0;
      const field = unit === "second" ? parts.seconds : unit === "minute" ? parts.minutes : parts.hours;
      if (t > lo && whole && field % count === 0) out.push(t);
    }
    return out;
  }
  // Calendar units: each boundary is made from its fields, so a day is a day however long it is.
  const nth: (i: number) => number =
    unit === "day"
      ? (i) => midnight(zone, start.year, start.month, start.date + i)
      : unit === "week"
        ? // Weeks start on Monday, as ISO 8601's do.
          (i) => midnight(zone, start.year, start.month, start.date - ((start.weekday + 6) % 7) + 7 * i)
        : unit === "month"
          ? (i) => midnight(zone, start.year, Math.floor(start.month / count) * count + count * i, 1)
          : (i) => midnight(zone, Math.floor(start.year / count) * count + count * i, 0, 1);
  let previous = -Infinity;
  for (let i = 0; ; i++) {
    const t = nth(i);
    // A boundary always moves on; the check only guards against a zone that doesn't.
    if (t >= hi || t <= previous) break;
    previous = t;
    // Every other day counts from the 1st of each month.
    if (t > lo && (unit !== "day" || (partsOf(t, zone).date - 1) % count === 0)) out.push(t);
  }
  return out;
}

/**
 * `months` calendar months on from `t`, or back when it's negative, in the zone: the same day of the
 * month at the same time of day, or the month's last day when it's shorter, as Temporal's `add`
 * constrains it (31 January a month on is 28 February, or the 29th in a leap year). A time the
 * clocks skip there comes out just after the change, as Date's setters move it.
 */
export function monthsOn(t: number, months: number, zone: TimeZone): number {
  const { year, month, date, hours, minutes, seconds, ms } = partsOf(t, zone);
  // Day 0 of the month after is the last of the month: every zone's calendar has the same months.
  const last = new Date(0);
  last.setUTCFullYear(year, month + months + 1, 0);
  const day = Math.min(date, last.getUTCDate());
  return timeAt(zone, year, month + months, day, hours, minutes, seconds, ms);
}

/** The coarsest boundary `t` falls on, in the zone. */
export function timeLevel(t: number, zone: TimeZone): TimeLevel {
  const { ms, seconds, minutes, hours, date, month } = partsOf(t, zone);
  if (ms !== 0) return "millisecond";
  if (seconds !== 0) return "second";
  if (minutes !== 0) return "minute";
  if (hours !== 0) return "hour";
  if (date !== 1) return "day";
  return month !== 0 ? "month" : "year";
}

/**
 * How the chart says an x for people: a medium date in the page's locale ("Jan 5, 2026", or "5 Jan
 * 2026" in en-GB), with the time when any of `times` has one ("Jan 5, 2026, 3:00 PM"), its seconds
 * when any has those, and its milliseconds when any has those ("Jan 5, 2026, 3:00:00.100 PM"), so
 * every x is said differently. Where the clocks go back, a time that comes twice adds the zone's
 * short name ("Oct 25, 2026, 1:30 AM GMT+1", "25 Oct 2026, 01:30 BST" in en-GB), so the two differ too.
 */
export function timeName(times: readonly number[], zone: TimeZone): (t: number) => string {
  const shown = clockReader(zone);
  // The level of the time the clock shows, read in UTC, is the time's level in the zone.
  const finest = times.reduce((max, t) => Math.max(max, LEVELS.indexOf(timeLevel(shown(t), "UTC"))), 0);
  const timeZone = zoneOption(zone);
  const timeStyle = finest >= LEVELS.indexOf("second") ? "medium" : finest >= LEVELS.indexOf("hour") ? "short" : undefined;
  // Intl's styles can't say a fraction of a second, so a time to the millisecond is said field by
  // field, as the medium styles say the rest.
  const options: Intl.DateTimeFormatOptions =
    finest === LEVELS.indexOf("millisecond")
      ? { year: "numeric", ...FIELDS.day, ...FIELDS.millisecond, timeZone }
      : { dateStyle: "medium", ...(timeStyle ? { timeStyle } : {}), timeZone };
  const format = new Intl.DateTimeFormat(undefined, options);
  // No time comes twice in UTC, and a date alone needs no zone.
  if (zone === "UTC" || !timeStyle) return (t) => format.format(t);
  const named = new Intl.DateTimeFormat(undefined, { timeZone, timeZoneName: "short" });
  return (t) => {
    const text = format.format(t);
    if (twinOf(t, shown) === undefined) return text;
    const name = named.formatToParts(t).find((part) => part.type === "timeZoneName")?.value;
    return name ? `${text} ${name}` : text;
  };
}

/** Words a time for its own level, with every level up to `upTo` when it's finer than that ("millisecond" adds none). A formatter per set of fields, made when first needed. */
function tickWording(zone: TimeZone): (t: number, upTo: TimeLevel) => string {
  const formats = new Map<string, Intl.DateTimeFormat>();
  return (t, upTo) => {
    const own = LEVELS.indexOf(timeLevel(t, zone));
    const fields: Intl.DateTimeFormatOptions = {};
    for (let i = Math.min(own, LEVELS.indexOf(upTo)); i <= own; i++) Object.assign(fields, FIELDS[LEVELS[i]!]);
    const id = JSON.stringify(fields);
    let format = formats.get(id);
    if (!format) formats.set(id, (format = new Intl.DateTimeFormat(undefined, { ...fields, timeZone: zoneOption(zone) })));
    return format.format(t);
  };
}

/** Intl's timeZone for the zone: undefined is the viewer's own. */
const zoneOption = (zone: TimeZone): string | undefined => (zone === "local" ? undefined : zone);

interface Parts {
  readonly year: number;
  /** 0 to 11. */
  readonly month: number;
  /** The day of the month, from 1. */
  readonly date: number;
  /** 0 is Sunday. */
  readonly weekday: number;
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
  readonly ms: number;
}

/** The fields of `t` in the zone: a named zone's are the UTC fields of what its clock shows. */
function partsOf(t: number, zone: TimeZone): Parts {
  const d = new Date(zone === "UTC" || zone === "local" ? t : shownAt(t, zone));
  return zone === "local"
    ? { year: d.getFullYear(), month: d.getMonth(), date: d.getDate(), weekday: d.getDay(), hours: d.getHours(), minutes: d.getMinutes(), seconds: d.getSeconds(), ms: d.getMilliseconds() }
    : { year: d.getUTCFullYear(), month: d.getUTCMonth(), date: d.getUTCDate(), weekday: d.getUTCDay(), hours: d.getUTCHours(), minutes: d.getUTCMinutes(), seconds: d.getUTCSeconds(), ms: d.getUTCMilliseconds() };
}

/** The start of a day in the zone: midnight, or the first time after it when the clocks skip it. The month and the day may run over, as in `utc`. */
function midnight(zone: TimeZone, year: number, month: number, date: number): number {
  return timeAt(zone, year, month, date);
}

/**
 * The time when the zone's clock shows these fields, as Date's setters find it in local time: the
 * first of the two where the clocks go back, and where they skip the time, as far past the change as
 * it is past the clock's last time before the change (2:30 when the clocks skip from 2 to 3 is 3:30).
 * The month and the day may run over, as in `utc`. A named zone's offsets are read a day either side,
 * since no zone changes its clocks twice in two days.
 */
function timeAt(zone: TimeZone, year: number, month: number, date: number, hours = 0, minutes = 0, seconds = 0, ms = 0): number {
  if (zone === "local") {
    const d = new Date(0);
    d.setFullYear(year, month, date);
    d.setHours(hours, minutes, seconds, ms);
    return d.getTime();
  }
  const shown = utc(year, month, date, hours, minutes, seconds, ms);
  if (zone === "UTC") return shown;
  // The fields in the offset before any change near them, and in the one after.
  const before = shown - (shownAt(shown - DAY, zone) - (shown - DAY));
  const after = shown - (shownAt(shown + DAY, zone) - (shown + DAY));
  if (before === after) return before;
  const fits = [before, after].filter((t) => shownAt(t, zone) === shown);
  return fits.length > 0 ? Math.min(...fits) : before;
}

/**
 * The time whose UTC fields are these. The month and the day may run over, as Date's setters allow
 * (day 32 of January is 1 February). The setters take any year, unlike Date.UTC, which reads 0 to 99
 * as 1900 to 1999.
 */
function utc(year: number, month: number, date: number, hours = 0, minutes = 0, seconds = 0, ms = 0): number {
  const d = new Date(0);
  d.setUTCFullYear(year, month, date);
  d.setUTCHours(hours, minutes, seconds, ms);
  return d.getTime();
}

/**
 * What the zone's clock shows at `t`, as the time whose UTC fields are the clock's: in UTC, `t`
 * itself. A named zone's clock is read to the second through Intl, which rounds down, and keeps `t`'s
 * milliseconds, since zones are offset by whole seconds.
 */
function shownAt(t: number, zone: TimeZone): number {
  if (zone === "UTC") return t;
  if (zone === "local") {
    const d = new Date(t);
    return utc(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
  }
  const ms = ((t % SECOND) + SECOND) % SECOND;
  const fields: Record<string, string> = {};
  for (const part of clockOf(zone).formatToParts(t - ms)) fields[part.type] = part.value;
  const year = Number(fields["year"]);
  return utc(fields["era"] === "BC" ? 1 - year : year, Number(fields["month"]) - 1, Number(fields["day"]), Number(fields["hour"]) % 24, Number(fields["minute"]), Number(fields["second"]), ms);
}

/** Reads the zone's clock. A named zone's reads go through Intl, which takes longer than Date's getters, so the reader keeps each time's. */
function clockReader(zone: TimeZone): (t: number) => number {
  if (zone === "UTC" || zone === "local") return (t) => shownAt(t, zone);
  const kept = new Map<number, number>();
  return (t) => {
    let shown = kept.get(t);
    if (shown === undefined) kept.set(t, (shown = shownAt(t, zone)));
    return shown;
  };
}

/**
 * Where the clocks go back, the other time the zone's clock shows what it shows at `t` (1:30 the
 * second time for 1:30 the first, and back); otherwise undefined. `shown` reads the clock. The
 * offsets are read a day either side, as in `timeAt`.
 */
function twinOf(t: number, shown: (t: number) => number): number | undefined {
  const at = shown(t);
  for (const near of [t - DAY, t + DAY]) {
    const other = at - (shown(near) - near);
    if (other !== t && shown(other) === at) return other;
  }
  return undefined;
}

/**
 * A named zone's clock: Intl's fields for it in en-US, in 24 hours and with the era, so every year
 * reads (1 BC is year 0). One for each name, made when the name is first checked and kept, so reading
 * a time makes no formatter. Intl throws a RangeError on a name it doesn't know.
 */
const clocks = new Map<string, Intl.DateTimeFormat>();

function clockOf(zone: string): Intl.DateTimeFormat {
  let clock = clocks.get(zone);
  if (!clock) {
    clock = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", era: "short", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
    clocks.set(zone, clock);
  }
  return clock;
}
