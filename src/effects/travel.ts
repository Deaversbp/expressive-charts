// travel: carries an icon along a mark's walk (the ball rolling out a bar, the boot stepping along
// the assists). It reads only the walk, the thickness and the segments, so it runs on any mark.

import { easeOutCubic, matrix, offset } from "../core";
import type { EffectContext, GeometryEffect, Icon, IconHandle, MarkGeometry, Matrix, Point } from "../core";
import { normalizeAngle } from "../core/geometry";
import { gaits, type Gait, type GaitName } from "./gaits";

export interface TravelOptions {
  /**
   * A segment's series ("goals"); the whole walk if omitted. A mark with no segments counts as its
   * own one segment. A missing segment, or one shorter than 0.5 px, makes travel a no-op.
   */
  readonly along?: string;
  /** How the icon moves. Default: the icon's own gait, else "slide". */
  readonly gait?: Gait | GaitName;
  /** Length along the walk in px, or "fit": scaled so the icon is 85% of the mark's thickness across. Default: the icon's own size. */
  readonly size?: number | "fit";
  /** "follow" turns with the walk, "level" never turns, "auto" (default) follows but mirrors an upright icon instead of turning it upside down. */
  readonly orient?: "auto" | "follow" | "level";
  /** "center" (default) puts the icon's anchor on the walk; "on" sits the icon on top of it (a ball riding a line). */
  readonly ride?: "center" | "on";
}

/** Base duration: max(260 ms, distance ÷ 360 px/s) times the gait's pace, at most 4 s, with effect timing. */
const SPEED = 360;
const SHORTEST = 260;
/**
 * The longest trip, base ms, after the gait's pace: past 1,440 px at pace 1 the icon goes faster,
 * not longer. With stagger's longest spread (500 ms) in front, it still ends within 5 s (WCAG 2.2.2).
 */
const LONGEST = 4000;
/** A walk shorter than this draws nothing. */
const MIN_WALK = 0.5;
/** "fit" makes the icon this much of the mark's thickness. */
const FIT = 0.85;
/** The heading is smoothed over at least this many px either side, so corners don't snap. */
const MIN_SMOOTHING = 2;
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const ORIENTS: readonly string[] = ["auto", "follow", "level"];
const RIDES: readonly string[] = ["center", "on"];

/** One trip of an icon along one walk. */
interface Trip {
  readonly icon: Icon;
  /** Drawn length along the walk, px. */
  readonly size: number;
  /** How far the anchor moves, px, across no gap; 0 when every part of the walk is shorter than the icon. */
  readonly span: number;
  /** Base ms, before the motion mode scales it. */
  readonly duration: number;
  readonly gait: Gait;
  /** Where the icon is at eased progress p: the place() transform for its natural size. */
  transform(progress: number): Matrix;
}

/**
 * Moves an icon along the walk, or along one segment, inset by the icon's footprint so it stays
 * inside the mark. Its end state is the icon resting at the end. An icon given by name is looked up
 * in `ctx.icons` when it runs, and an unknown name throws there.
 *
 * Across a gap in the walk it jumps: it's inset from each part's ends as from the walk's, and goes
 * from one part to the next at once, so it's never drawn over a gap. The trip's time counts only the
 * parts it's drawn on, and a part shorter than the icon is skipped, unless it's the last: the icon
 * rests there, at the last value.
 */
export function travel(icon: Icon | string, options: TravelOptions = {}): GeometryEffect {
  checkOptions(icon, options);

  /** Plans the trip on the mark's current geometry; undefined when there's nothing to travel along. */
  function plan(mark: MarkGeometry, ctx: EffectContext): Trip | undefined {
    const resolved = typeof icon === "string" ? ctx.icons.get(icon) : icon;
    if (!resolved) throw new RangeError(`travel: unknown icon "${String(icon)}". Register it with registerIcon(icon), or pass the icon itself.`);
    const walk = pick(mark, options.along);
    if (!walk || !(drawn(walk) >= MIN_WALK)) return undefined;
    const scale =
      options.size === undefined ? 1 : options.size === "fit" ? (FIT * walk.thickness) / resolved.box.height : options.size / resolved.size;
    if (!(scale > 0)) return undefined;
    return trip(walk, resolved, scale, options);
  }

  /** Draws the trip at a progress, and follows the geometry when it moves (a resize, a transition). */
  function rider(mark: MarkGeometry, ctx: EffectContext): { readonly trip: Trip | undefined; show(progress: number): void } {
    let current = plan(mark, ctx);
    let handle: IconHandle | undefined;
    let drawn: { icon: Icon; size: number } | undefined;
    let progress = 0;
    const draw = (): void => {
      if (!current) {
        handle?.remove();
        handle = drawn = undefined;
        return;
      }
      if (!handle || drawn?.icon !== current.icon || drawn.size !== current.size) {
        handle?.remove();
        handle = ctx.layer.icon(current.icon, { size: current.size });
        drawn = { icon: current.icon, size: current.size };
      }
      handle.place(current.transform(progress));
    };
    ctx.onChange((next) => {
      current = plan(next, ctx);
      draw();
    });
    return {
      get trip() {
        return current;
      },
      show(p) {
        progress = p;
        draw();
      }
    };
  }

  return {
    kind: "geometry",
    async run(mark, ctx) {
      if (ctx.signal.aborted) return;
      const ride = rider(mark, ctx);
      const planned = ride.trip;
      // Nothing to travel along, or no room to move: draw the end state at once.
      if (!planned || planned.span <= 0) {
        ride.show(1);
        return;
      }
      await ctx.tween({
        duration: planned.duration,
        timing: "effect",
        ease: planned.gait.ease ?? easeOutCubic,
        update: (p) => ride.show(p)
      }).finished;
    },
    end(mark, ctx) {
      rider(mark, ctx).show(1);
    },
    clear() {}
  };
}

/** A part of the walk between gaps, in px along it, with how far the icon's anchor moves along it. */
interface Leg {
  readonly from: number;
  readonly to: number;
  readonly span: number;
  /** The span of the legs before it. */
  readonly before: number;
}

function trip(walk: MarkGeometry, icon: Icon, scale: number, options: TravelOptions): Trip {
  const gait = typeof options.gait === "function" ? options.gait : gaits[options.gait ?? icon.gait ?? "slide"]();
  const length = walk.length;
  const behind = icon.footprint[0] * scale;
  const ahead = icon.footprint[1] * scale;
  // A part shorter than the icon: the icon rests at its start (which may hang past its end) and doesn't move along it.
  let span = 0;
  const legs: Leg[] = parts(walk).map(([from, to]) => {
    const leg = { from, to, span: Math.max(0, to - from - behind - ahead), before: span };
    span += leg.span;
    return leg;
  });
  const smoothing = Math.max(MIN_SMOOTHING, (behind + ahead) / 2);
  const radius = icon.radius ?? icon.box.height / 2;
  const { anchor } = icon;
  // The drawing layer scales the icon about its anchor before place(), so the pivot moves with it.
  const pivot = { x: anchor.x + scale * (icon.pivot.x - anchor.x), y: anchor.y + scale * (icon.pivot.y - anchor.y) };
  // Riding on the walk: half the stroke, plus the anchor's height above the icon's bottom.
  const ride = options.ride === "on" ? walk.thickness / 2 + (icon.box.y + icon.box.height - anchor.y) * scale : 0;
  const orient = options.orient ?? "auto";

  return {
    icon,
    size: icon.size * scale,
    span,
    duration: Math.min(LONGEST, Math.max(SHORTEST, (span / SPEED) * 1000) * (gait.pace ?? 1)),
    gait,
    transform(progress) {
      const travelled = progress * span;
      // The last leg the icon has reached: a leg it can't move along is passed at once, unless it's the last.
      let index = legs.length - 1;
      while (index > 0 && legs[index]!.before > travelled) index--;
      const leg = legs[index]!;
      const distance = leg.from + behind + Math.min(leg.span, travelled - leg.before);
      const pose = gait({ distance: travelled / scale, length: span / scale, progress, radius });
      const at = pointAt(walk, distance);
      const direction = heading(walk, Math.min(distance, length), smoothing, leg);
      // Mirroring keeps an upright icon's top up when the walk heads left.
      const mirror = orient === "auto" && icon.upright === true && Math.cos(direction) < -1e-9;
      const turn = orient === "level" ? 0 : mirror ? normalizeAngle(direction - Math.PI) : direction;
      return matrix.multiply(
        matrix.translate(at.x, at.y),
        matrix.rotate(turn),
        mirror ? matrix.scale(-1, 1) : IDENTITY,
        matrix.translate(-anchor.x, -anchor.y - pose.lift * scale - ride),
        matrix.rotate(pose.spin - pose.tilt, pivot)
      );
    }
  };
}

/** The walk to travel along: the named segment, or the mark itself. */
function pick(mark: MarkGeometry, along: string | undefined): MarkGeometry | undefined {
  if (along === undefined) return mark;
  if (mark.segments) return mark.segments.find((segment) => segment.series === along);
  return mark.series === along ? mark : undefined;
}

/** The walk's parts between its gaps, as [from, to] px along it, in order. A walk with no gaps is one part. */
function parts(walk: MarkGeometry): [number, number][] {
  const { length } = walk;
  const found: [number, number][] = [];
  let at = 0;
  for (const [from, to] of walk.gaps ?? []) {
    // Taken as the contract has them, in order and apart; any that aren't are read as far as they go.
    if (!(to > from) || !(to > at)) continue;
    if (from > at) found.push([at * length, Math.min(1, from) * length]);
    at = Math.min(1, to);
  }
  found.push([at * length, length]);
  return found;
}

/** How much of the walk is drawn: its length less its gaps. */
function drawn(walk: MarkGeometry): number {
  return parts(walk).reduce((sum, [from, to]) => sum + (to - from), 0);
}

/** The point `distance` px along the walk; past the end, it carries on in the end's direction. */
function pointAt(walk: MarkGeometry, distance: number): Point {
  const { length } = walk;
  return distance <= length ? walk.path(distance / length) : offset(walk.end, walk.angle(1), distance - length);
}

/**
 * The direction of travel at `distance`, smoothed over a window either side: the chord between the
 * window's ends. On straight legs and circular arcs the chord is exactly the tangent; across a
 * polyline corner it turns gradually. The window shrinks near the ends of the leg so it stays on it,
 * never across a gap.
 */
function heading(walk: MarkGeometry, distance: number, window: number, leg: Leg): number {
  const { length } = walk;
  const reach = Math.min(window, distance - leg.from, leg.to - distance);
  if (reach > 1e-6) {
    const a = walk.path((distance - reach) / length);
    const b = walk.path((distance + reach) / length);
    if (Math.hypot(b.x - a.x, b.y - a.y) > 1e-9) return Math.atan2(b.y - a.y, b.x - a.x);
  }
  return walk.angle(distance / length);
}

function checkOptions(icon: Icon | string, options: TravelOptions): void {
  const named = typeof icon === "string" && icon !== "";
  if (!named && (typeof icon !== "object" || icon === null || typeof icon.name !== "string")) {
    throw new TypeError(`travel needs an icon or an icon's name, got ${icon === null ? "null" : typeof icon}.`);
  }
  const { along, gait, size, orient, ride } = options;
  if (along !== undefined && typeof along !== "string") throw new RangeError(`travel: along must be a series name, got ${String(along)}.`);
  if (gait !== undefined && typeof gait !== "function" && !Object.prototype.hasOwnProperty.call(gaits, gait)) {
    throw new RangeError(`travel: gait must be a gait or one of roll, step, slide, got ${String(gait)}.`);
  }
  if (size !== undefined && size !== "fit" && !(typeof size === "number" && size > 0 && Number.isFinite(size))) {
    throw new RangeError(`travel: size must be more than 0 px, or "fit", got ${String(size)}.`);
  }
  if (orient !== undefined && !ORIENTS.includes(orient)) throw new RangeError(`travel: orient must be auto, follow or level, got ${String(orient)}.`);
  if (ride !== undefined && !RIDES.includes(ride)) throw new RangeError(`travel: ride must be center or on, got ${String(ride)}.`);
}
