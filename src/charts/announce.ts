// Announcements: with `announce`, a polite live region that sums up each update for screen readers.
// The chart writes the generic part ("Sorted A to Z", "Okafor and Tanaka changed"); a page that knows
// more ("Matchweek 25") passes a function that writes its own text from the chart's.

export type SortName = "value" | "key" | "none" | "custom";

/** What changed in an update, as the chart sees it. Names are the marks' categories, in visual order. */
export interface ChangeFacts {
  /** The chart's new label, when it changed. */
  readonly label?: string;
  /** The new series, when they changed. */
  readonly series?: readonly string[];
  /** The new sort, when it changed. */
  readonly sort?: SortName;
  readonly changed: readonly string[];
  readonly added: readonly string[];
  readonly removed: readonly string[];
  /** Marks after the update. */
  readonly count: number;
}

export interface Announcer {
  /** Announces `text`, politely. Saying the same thing twice in a row is announced twice. */
  say(text: string): void;
  destroy(): void;
}

const SORTED: Record<SortName, string> = {
  value: "Sorted highest first",
  key: "Sorted A to Z",
  none: "In data order",
  custom: "Sorted"
};

/** Lists more than this many marks as a count: "5 of 8 changed". */
const NAMED = 3;

/**
 * The chart's own summary, a sentence for each kind of change, or "" when nothing it reports changed.
 * A new label stands for the view it names; otherwise new series are named. A change of series
 * changes every value, so the marks that changed are counted only when the series stayed.
 */
export function changeText(facts: ChangeFacts): string {
  const parts: string[] = [];
  const { series } = facts;
  if (facts.label !== undefined) parts.push(facts.label);
  // A lone value read by a function has no name worth saying.
  else if (series && !(series.length === 1 && series[0] === "value")) parts.push(`Showing ${list(series)}`);
  if (facts.sort) parts.push(SORTED[facts.sort]);
  const { changed, added, removed } = facts;
  if (!series && changed.length > 0) parts.push(changed.length <= NAMED ? `${list(changed)} changed` : `${changed.length} of ${facts.count} changed`);
  if (added.length > 0) parts.push(`Added ${added.length <= NAMED ? list(added) : added.length}`);
  if (removed.length > 0) parts.push(`Removed ${removed.length <= NAMED ? list(removed) : removed.length}`);
  return parts.join(". ");
}

/** "a", "a and b", "a, b and c". */
function list(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The live region for a chart's <svg>: a visually hidden role="status" just after it. Make it before
 * the first announcement: screen readers miss text in a region that appears with it.
 */
export function chartAnnouncer(svg: SVGSVGElement): Announcer {
  const region = svg.ownerDocument.createElement("div");
  region.className = "ec-announcer ec-visually-hidden";
  region.setAttribute("role", "status");
  region.setAttribute("aria-live", "polite");
  region.setAttribute("aria-atomic", "true");
  svg.after(region);
  /** Alternates, so the same text twice is still a change the region announces. */
  let odd = false;
  return {
    say(text) {
      if (text === "") return;
      odd = !odd;
      region.textContent = odd ? text : `${text} `;
    },
    destroy() {
      region.remove();
    }
  };
}
