// A chart switch: views of the same data in one place, one shown at a time, and a transition effect
// that turns each mark of one view into its own mark in the next, as the lab's donut turns into
// columns. It reads only what a chart's handle reports (marks and labels by key, focus by key, and
// its <svg>), so it never names a chart type, and it plays whatever transition effect it's given:
// the composition root (src/index.ts) fills in morph() when the page leaves it out.
//
// A switch runs along one line, s, from 0 (the view it began in, `a`) to 1 (the view it went to,
// `b`). The pairs morph at s; the labels move and swap their text, the unmatched marks fade, and the
// views' other parts fade, each as a function of s, as the lab draws its centre and baseline from
// its one `t`. So a switch back mid-way plays the same picture backwards from where it is.

import { defaultClock, easeInOutCubic, linear, matrix, tween, type MarkGeometry, type Matrix, type MotionEnv, type Point, type TransitionEffect, type Tween } from "../core";
import { isTransitionEffect, playTransition, type Transition, type TransitionPair, type TransitionSurface } from "../core/transition";
import { formatPath, parsePath, transformPath } from "../icons/path";
import { between, boxIn } from "./adapter/space";
import { chartAnnouncer, type Announcer } from "./announce";
import { toColorAssignment, type ColorAssignment } from "./colors";
import { svgLayer } from "./render/layer";
import { setAttributes, setStyles, svgElement } from "./render/svg";
import { injectStyles, markColorStyles, seriesColors } from "./render/theme";
import { resolveTarget, type ChartEnv } from "./shell/setup";
import type { ChartLabel } from "./types";

/**
 * What a chart switch uses of each view's chart. A reference chart's handle has all of it: its
 * `<svg>` (which takes `ec-morphing` while its marks morph in the switch's overlay), its marks and
 * labels as drawn, focus by key, and destroy().
 */
export interface ChartSwitchView {
  readonly element: SVGSVGElement;
  marks(): readonly MarkGeometry[];
  labels(): readonly ChartLabel[];
  focus(key: string): void;
  destroy(): void;
}

/**
 * Draws one view's chart in `container` and returns it. `colors` is the switch's assignment: pass it
 * to the chart as its `colors`, so a key has the same colour in every view and in the overlay.
 */
export type ChartSwitchViewFactory = (container: HTMLElement, colors: ColorAssignment) => ChartSwitchView;

/** The views by name, each a function that draws its chart. */
export type ChartSwitchViews = Readonly<Record<string, ChartSwitchViewFactory>>;

/** A view's name. */
export type ChartSwitchViewName<T extends ChartSwitchViews> = keyof T & string;

export interface ChartSwitchOptions<T extends ChartSwitchViews> {
  /** The views by name. Each is drawn once, when the switch is created, in a container of its own; they share one grid cell. */
  readonly views: T;
  /** The view shown first. */
  readonly initial: NoInfer<ChartSwitchViewName<T>>;
  /** Plays each pair of marks, matched by key. Default: morph(). */
  readonly transition?: TransitionEffect;
  /** Palette slots by key, shared by every view (each view's function is given it). Default: a new assignment. */
  readonly colors?: ColorAssignment | Readonly<Record<string, number>>;
  /** A polite live region that says the new view's label (its chart's `label`) after each switch. Default false. */
  readonly announce?: boolean;
}

export interface ChartSwitch<T extends ChartSwitchViews> {
  /** The view shown, or the one a switch is heading for. */
  readonly current: ChartSwitchViewName<T>;
  /**
   * Switches to `view`: each mark morphs into the mark with its key, by the motion mode. Resolves
   * when the switch has landed, or as soon as another show() replaces it. A show() back to the view
   * a switch is leaving reverses it from where the shapes are; one to a third view lands the switch
   * first. With motion off, the switch has landed when show() returns. Rejects for an unknown view.
   */
  show(view: ChartSwitchViewName<T>): Promise<void>;
  /** The chart a view's function returned: for update(), on() and the rest. */
  chart<K extends ChartSwitchViewName<T>>(view: K): ReturnType<T[K]>;
  /** Ends any switch, destroys every view's chart and removes everything the switch added. */
  destroy(): void;
}

/** The lab's morph: 950 ms base, with transition timing, in one stage. */
const DURATION = 950;
/** The old view's other parts are gone by here. */
const OUT_BY = 0.4;
/** The new view's other parts start to show here; labels swap their text, and unmatched marks hand over. */
const HALF = 0.5;

interface View {
  readonly name: string;
  readonly container: HTMLDivElement;
  readonly chart: ChartSwitchView;
}

/** Where focus was when a switch began, if it was in the view it left: on a mark (its key) or elsewhere. */
interface FocusMemory {
  readonly key: string | undefined;
}

/** What a switch draws in its overlay besides the pairs, at each s. */
interface Scene {
  draw(s: number): void;
  clear(): void;
}

interface Switch {
  /** Where s is 0: the view the switch began in. */
  readonly a: View;
  /** Where s is 1: the view it went to. */
  readonly b: View;
  /** Heading for b. A show() back flips it. */
  forward: boolean;
  /** From a to b, in b's order; `reversed` is the same pairs from b to a, in the same order, so the overlay stacks the same way back. */
  readonly pairs: readonly TransitionPair[];
  readonly reversed: readonly TransitionPair[];
  readonly scene: Scene;
  readonly focus: FocusMemory | undefined;
  /** The run's eased progress from where it began to where it's heading, as last drawn: the shapes' progress, as morph draws them. */
  progress: number;
  transition: Transition | undefined;
  driver: Tween | undefined;
  /** Counts runs, so a run that was replaced or landed doesn't land the switch. */
  run: number;
  /** What the latest show() returned, and its resolve. */
  done: Promise<void>;
  settle: () => void;
}

/**
 * Views of the same data in `target` (an element or a selector), one shown at a time. Each view's
 * chart is drawn once, in its own container; the containers share one grid cell, so a view keeps
 * its layout while it's hidden. `show(view)` hides both views' marks and plays `transition` on each
 * pair of marks with the same key in an overlay above them, while the labels move to their places
 * in the new view and swap their text half way, marks with no partner fade, and the old view's other
 * parts (axes, centre text, legend, table) fade out as the new one's fade in.
 */
export function chartSwitch<T extends ChartSwitchViews>(
  target: string | Element,
  options: ChartSwitchOptions<T> & { readonly transition: TransitionEffect },
  env: Pick<ChartEnv, "icons" | "motion" | "clock">
): ChartSwitch<T> {
  const host = resolveTarget(target, "chartSwitch");
  const names = checkOptions(options);
  const effect = options.transition;
  const colors = toColorAssignment(options.colors);
  const motion = env.motion;
  const clock = env.clock ?? defaultClock;
  const doc = host.ownerDocument;
  injectStyles(doc);

  const wrapper = doc.createElement("div");
  wrapper.className = "ec-switch";
  host.appendChild(wrapper);
  const views = new Map<string, View>();
  try {
    for (const name of names) {
      const container = doc.createElement("div");
      container.className = "ec-switch-view";
      container.setAttribute("data-view", name);
      wrapper.appendChild(container);
      // Hidden before its chart is drawn, so it never shows; it still lays out at the cell's width.
      setActive(container, name === options.initial);
      const chart: unknown = options.views[name]!(container, colors);
      if (!isView(chart, container)) {
        (chart as Partial<ChartSwitchView> | null)?.destroy?.();
        throw new TypeError(`chartSwitch: views.${name} must return the chart it draws in the container it's given (with element, marks(), labels(), focus() and destroy()), such as donutChart(container, { ... }).`);
      }
      views.set(name, { name, container, chart });
    }
  } catch (error) {
    for (const view of views.values()) view.chart.destroy();
    wrapper.remove();
    throw error;
  }

  // Above the views: the pairs, the marks fading, and the labels, in px from the cell's top left.
  // `ec-chart` gives the copied labels the stylesheet's text sizes.
  const overlay = svgElement("svg", { class: "ec-chart ec-switch-overlay", "aria-hidden": "true" }, wrapper);
  const fadesLayer = svgElement("g", { class: "ec-switch-fades" }, overlay);
  const runsLayer = svgElement("g", { class: "ec-switch-runs" }, overlay);
  const labelsLayer = svgElement("g", { class: "ec-switch-labels" }, overlay);
  // Made now: screen readers miss text in a region that appears with it.
  const announcer: Announcer | undefined = options.announce ? chartAnnouncer(overlay) : undefined;

  /** Each pair's run draws in a group of its own, in its key's colour, stacked by the pair's place. */
  const orders = new WeakMap<Element, number>();
  const surface: TransitionSurface = {
    group(key, order) {
      const group = svgElement("g", { class: "ec-run", "data-key": key }, runsLayer);
      setStyles(group, markColorStyles(seriesColors(colors.slot(key))));
      orders.set(group, order);
      const above = Array.from(runsLayer.children).find((child) => (orders.get(child) ?? -Infinity) > order);
      runsLayer.insertBefore(group, above ?? null);
      return { ...svgLayer(group), clear: () => group.remove() };
    }
  };

  let current: string = options.initial;
  let active: Switch | undefined;
  let destroyed = false;

  // Turning motion off mid-switch lands it, as every animation jumps to its end.
  const stopMotion = motion.subscribe(() => {
    if (motion.mode === "off" && active) land(active, true);
  });

  // A resize lands a switch: the charts lay out again, and the shapes it began with are stale. The
  // first observation, which comes after observe(), is the width to compare with.
  let width: number | undefined;
  const observer =
    typeof ResizeObserver === "function"
      ? new ResizeObserver((entries) => {
          const next = entries[entries.length - 1]?.contentRect.width ?? 0;
          if (width !== undefined && Math.abs(next - width) < 0.5) return;
          const first = width === undefined;
          width = next;
          if (!first && active) land(active, true);
        })
      : undefined;
  observer?.observe(wrapper);

  const view = (name: string): View => views.get(name)!;

  /** The element with focus in the switch's document or shadow root. */
  function focused(): Element | null {
    return (wrapper.getRootNode() as Document | ShadowRoot).activeElement ?? null;
  }

  /** Read before anything is hidden: a browser may move focus off an element that turns hidden. */
  function readFocus(from: View): FocusMemory | undefined {
    const element = focused();
    if (!element || !from.container.contains(element)) return undefined;
    const keyed = element.closest("[data-key]");
    return { key: keyed && from.chart.element.contains(keyed) ? (keyed.getAttribute("data-key") ?? undefined) : undefined };
  }

  /** Ends the view's hover as the viewer would: focus leaves its mark, and the pointer leaves its <svg>. */
  function endHover(from: View): void {
    const element = focused();
    if (element && from.container.contains(element)) (element as HTMLElement | SVGElement).blur?.();
    const win = doc.defaultView;
    const leave = win?.PointerEvent ? new win.PointerEvent("pointerleave", { pointerType: "mouse" }) : win?.MouseEvent ? new win.MouseEvent("pointerleave") : undefined;
    if (leave) from.chart.element.dispatchEvent(leave);
  }

  /** Focus that was in the old view goes to the same key in the new one, or to its first mark, unless it has moved on outside the switch. */
  function restoreFocus(to: View, memory: FocusMemory | undefined): void {
    if (!memory) return;
    const now = focused();
    if (now && now !== doc.body && now !== doc.documentElement && !wrapper.contains(now)) return;
    const inside = (): boolean => to.chart.element.contains(focused());
    if (memory.key !== undefined) to.chart.focus(memory.key);
    if (inside()) return;
    for (const mark of to.chart.marks()) {
      to.chart.focus(mark.key);
      if (inside()) return;
    }
  }

  function say(to: View): void {
    announcer?.say(to.chart.element.getAttribute("aria-label") ?? "");
  }

  function start(from: View, to: View, carried?: { readonly focus: FocusMemory | undefined }): Promise<void> {
    current = to.name;
    const memory = carried ? carried.focus : readFocus(from);
    endHover(from);
    if (motion.mode === "off") {
      for (const each of views.values()) setActive(each.container, each === to);
      restoreFocus(to, memory);
      say(to);
      return Promise.resolve();
    }
    // Both views' marks and labels hide, and neither can be reached until the switch lands; the
    // new view shows, its other parts faded out.
    for (const each of [from, to]) {
      each.container.classList.remove("ec-switch-inactive");
      each.container.classList.add("ec-switching");
      each.container.setAttribute("inert", "");
      each.chart.element.classList.add("ec-morphing");
    }
    const { pairs, scene } = prepare(from, to);
    const { done, settle } = deferred();
    const session: Switch = {
      a: from,
      b: to,
      forward: true,
      pairs,
      reversed: pairs.map(({ from: a, to: b }) => ({ from: b, to: a })),
      scene,
      focus: memory,
      progress: 0,
      transition: undefined,
      driver: undefined,
      run: 0,
      done,
      settle
    };
    active = session;
    play(session, 0);
    return session.done;
  }

  /** Plays the pairs toward where the switch is heading, from `begin` in the shapes' progress, and the scene with them. */
  function play(session: Switch, begin: number): void {
    const run = ++session.run;
    if (begin >= 1) {
      land(session, true);
      return;
    }
    const at = (progress: number): void => {
      session.progress = progress;
      session.scene.draw(session.forward ? progress : 1 - progress);
    };
    session.transition = playTransition(session.forward ? session.pairs : session.reversed, { effect, surface, start: begin, motion, clock, icons: env.icons });
    // Started in the same moment as the pairs' runs, on the same clock and with morph's timing, so
    // `progress` is the progress morph draws the shapes at, frame by frame.
    session.driver = drive(begin, at, { clock, motion });
    void Promise.all([session.driver.finished, session.transition.finished]).then(([result]) => {
      if (active === session && session.run === run && result === "done") land(session, true);
    });
  }

  /** A show() back mid-way: the pairs play back from where the shapes are, and so does everything drawn with them. */
  function reverse(session: Switch): Promise<void> {
    session.driver?.cancel();
    session.transition?.clear();
    session.forward = !session.forward;
    current = (session.forward ? session.b : session.a).name;
    session.settle();
    ({ done: session.done, settle: session.settle } = deferred());
    play(session, 1 - session.progress);
    return session.done;
  }

  /**
   * Ends the switch where it's heading: the overlay empties, that view's marks show and it becomes
   * the active view, every other view inactive. `settle`: focus follows its key and the new view is
   * announced; a switch landed for one to a third view hands its focus on instead.
   */
  function land(session: Switch, settle: boolean): void {
    if (active !== session) return;
    active = undefined;
    session.run++;
    session.driver?.cancel();
    session.transition?.clear();
    session.scene.clear();
    const to = session.forward ? session.b : session.a;
    for (const each of [session.a, session.b]) {
      each.chart.element.classList.remove("ec-morphing");
      each.container.classList.remove("ec-switching");
      each.container.style.removeProperty("opacity");
    }
    for (const each of views.values()) setActive(each.container, each === to);
    if (settle) {
      restoreFocus(to, session.focus);
      say(to);
    }
    session.settle();
  }

  /** Both views' marks and labels in overlay px, the pairs matched by key, and what's drawn with them. */
  function prepare(a: View, b: View): { pairs: TransitionPair[]; scene: Scene } {
    const toA = between(overlay, a.chart.element, wrapper);
    const toB = between(overlay, b.chart.element, wrapper);
    const from = a.chart.marks().map((mark) => mapMark(mark, toA));
    const to = b.chart.marks().map((mark) => mapMark(mark, toB));
    const fromByKey = new Map(from.map((mark) => [mark.key, mark]));
    const toKeys = new Set(to.map((mark) => mark.key));
    const pairs = to.flatMap((mark) => {
      const partner = fromByKey.get(mark.key);
      return partner ? [{ from: partner, to: mark }] : [];
    });

    const drawings: ((s: number) => void)[] = [];
    // Marks with no partner fade where they stand: out over the first half, in over the second.
    for (const mark of from) if (!toKeys.has(mark.key)) drawings.push(fadeMark(mark, fadeOut));
    for (const mark of to) if (!fromByKey.has(mark.key)) drawings.push(fadeMark(mark, fadeIn));

    // Labels match by key and role. A pair moves from one place to the other and swaps its text half
    // way; a label with no partner fades, as a mark does.
    const id = (label: ChartLabel): string => `${label.role}\n${label.key}`;
    const labelsA = a.chart.labels();
    const labelsB = b.chart.labels();
    const byId = new Map(labelsA.map((label) => [id(label), label]));
    const matched = new Set<string>();
    for (const label of labelsB) {
      const partner = byId.get(id(label));
      if (!partner) continue;
      matched.add(id(label));
      drawings.push(moveLabel(copyLabel(partner, toA), copyLabel(label, toB)));
    }
    for (const label of labelsA) if (!matched.has(id(label))) drawings.push(fadeLabel(copyLabel(label, toA), fadeOut));
    for (const label of labelsB) if (!byId.has(id(label))) drawings.push(fadeLabel(copyLabel(label, toB), fadeIn));

    // The views' other parts: the old one's gone by 40% of the way, the new one's in from half way.
    drawings.push((s) => {
      setOpacity(a.container, 1 - clamp(s / OUT_BY));
      setOpacity(b.container, clamp((s - HALF) / (1 - HALF)));
    });

    return {
      pairs,
      scene: {
        draw: (s) => {
          for (const draw of drawings) draw(s);
        },
        clear: () => {
          fadesLayer.replaceChildren();
          runsLayer.replaceChildren();
          labelsLayer.replaceChildren();
        }
      }
    };
  }

  /** A mark with no partner, drawn as its outline in its key's colour. */
  function fadeMark(mark: MarkGeometry, opacity: (s: number) => number): (s: number) => void {
    const group = svgElement("g", { class: "ec-switch-fade", "data-key": mark.key }, fadesLayer);
    setStyles(group, markColorStyles(seriesColors(colors.slot(mark.key))));
    svgLayer(group).path(mark.outline.d, mark.outline.closed ? { fill: "mark" } : { stroke: "mark", width: mark.thickness });
    return (s) => setAttributes(group, { opacity: opacity(s) });
  }

  /** A copy of the label's <text> in the overlay, with its classes, and where it sits there. */
  function copyLabel(label: ChartLabel, m: Matrix): { readonly text: SVGTextElement; readonly at: Point } {
    const text = label.element.cloneNode(true) as SVGTextElement;
    for (const name of ["id", "opacity", "visibility", "aria-hidden"]) text.removeAttribute(name);
    text.textContent = label.text;
    const at = matrix.apply(m, label);
    setAttributes(text, { x: at.x, y: at.y, "text-anchor": label.anchor });
    labelsLayer.appendChild(text);
    return { text, at };
  }

  const api: ChartSwitch<T> = {
    get current() {
      return current as ChartSwitchViewName<T>;
    },
    show(name) {
      if (!views.has(name)) return Promise.reject(new TypeError(`chartSwitch: there's no view ${JSON.stringify(name)}. The views are ${names.map((n) => JSON.stringify(n)).join(", ")}.`));
      if (destroyed) return Promise.resolve();
      const session = active;
      if (!session) return name === current ? Promise.resolve() : start(view(current), view(name));
      const heading = session.forward ? session.b : session.a;
      const leaving = session.forward ? session.a : session.b;
      if (name === heading.name) return session.done;
      if (name === leaving.name) return reverse(session);
      // A third view: this switch lands first, and its focus goes on with the next.
      land(session, false);
      return start(heading, view(name), { focus: session.focus });
    },
    chart(name) {
      const found = views.get(name);
      if (!found) throw new TypeError(`chartSwitch: there's no view ${JSON.stringify(name)}. The views are ${names.map((n) => JSON.stringify(n)).join(", ")}.`);
      return found.chart as ReturnType<T[typeof name]>;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      const session = active;
      if (session) {
        active = undefined;
        session.run++;
        session.driver?.cancel();
        session.transition?.clear();
        session.scene.clear();
        session.settle();
      }
      stopMotion();
      observer?.disconnect();
      announcer?.destroy();
      for (const each of views.values()) each.chart.destroy();
      wrapper.remove();
    }
  };
  return api;
}

/**
 * A tween with morph's timing, from `begin` in the shapes' eased progress: 950 ms base with
 * transition timing, of which it takes the rest from where easeInOutCubic reaches `begin`, as morph
 * does. `at` gets the eased progress, `begin` itself first.
 */
function drive(begin: number, at: (progress: number) => void, env: MotionEnv): Tween {
  const begun = unease(begin);
  let running: Tween | undefined;
  running = tween(
    {
      duration: DURATION,
      timing: "transition",
      ease: linear,
      update: (k) => {
        const u = Math.min(1, begun + k);
        at(k === 0 ? begin : easeInOutCubic(u));
        if (u >= 1 && k < 1) running?.finish();
      }
    },
    env
  );
  return running;
}

/** The inactive view can't be seen, reached or read, but keeps its layout, so its geometry is ready for a switch. */
function setActive(container: HTMLElement, active: boolean): void {
  container.classList.toggle("ec-switch-inactive", !active);
  container.toggleAttribute("inert", !active);
  if (active) container.removeAttribute("aria-hidden");
  else container.setAttribute("aria-hidden", "true");
}

function setOpacity(container: HTMLElement, opacity: number): void {
  container.style.setProperty("opacity", String(Math.round(opacity * 1000) / 1000));
}

/** A matched label at s: both copies at the same place along the way, the old text before half way and the new from there. */
function moveLabel(a: { readonly text: SVGTextElement; readonly at: Point }, b: { readonly text: SVGTextElement; readonly at: Point }): (s: number) => void {
  return (s) => {
    const x = mix(a.at.x, b.at.x, s);
    const y = mix(a.at.y, b.at.y, s);
    const second = s >= HALF;
    setAttributes(a.text, { x, y, visibility: second ? "hidden" : undefined });
    setAttributes(b.text, { x, y, visibility: second ? undefined : "hidden" });
  };
}

function fadeLabel(label: { readonly text: SVGTextElement }, opacity: (s: number) => number): (s: number) => void {
  return (s) => setAttributes(label.text, { opacity: opacity(s) });
}

const fadeOut = (s: number): number => 1 - clamp(s / HALF);
const fadeIn = (s: number): number => clamp((s - HALF) / (1 - HALF));
const clamp = (value: number): number => Math.min(1, Math.max(0, value));
/** Weighted on both sides, as morph mixes, so a switch back puts a label where the switch forward had it. */
const mix = (x: number, y: number, s: number): number => x * (1 - s) + y * s;

/** The linear progress at which easeInOutCubic reaches s: morph's own, so a run from part way keeps its timing. */
function unease(s: number): number {
  return s < 0.5 ? Math.cbrt(s / 4) : 1 - Math.cbrt(2 * (1 - s)) / 2;
}

const isIdentity = (m: Matrix): boolean => m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;

/**
 * The mark in another coordinate space: a view's <svg> units to the overlay's px. A switch maps by
 * where each <svg> sits and how it's scaled, so the transform keeps angles; its outline's path data
 * is moved through it, arcs and all.
 */
function mapMark(mark: MarkGeometry, m: Matrix): MarkGeometry {
  if (isIdentity(m)) return mark;
  const point = (p: Point): Point => matrix.apply(m, p);
  const path = (d: string): string => formatPath(transformPath(parsePath(d), m));
  const scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
  const { outline } = mark;
  return {
    key: mark.key,
    ...(mark.series === undefined ? {} : { series: mark.series }),
    start: point(mark.start),
    end: point(mark.end),
    length: mark.length * scale,
    path: (t) => point(mark.path(t)),
    angle: (t) => {
      const angle = mark.angle(t);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      return Math.atan2(m[1] * cos + m[3] * sin, m[0] * cos + m[2] * sin);
    },
    slice: (t0, t1) => path(mark.slice(t0, t1)),
    thickness: mark.thickness * scale,
    outline: { d: path(outline.d), closed: outline.closed, sample: (n) => outline.sample(n).map(point) },
    bounds: boxIn(m, mark.bounds),
    center: point(mark.center),
    pivot: point(mark.pivot),
    ...(mark.segments === undefined ? {} : { segments: mark.segments.map((segment) => mapMark(segment, m)) })
  };
}

function deferred(): { done: Promise<void>; settle: () => void } {
  let settle!: () => void;
  const done = new Promise<void>((resolve) => {
    settle = resolve;
  });
  return { done, settle };
}

function isView(value: unknown, container: Element): value is ChartSwitchView {
  if (typeof value !== "object" || value === null) return false;
  const view = value as Partial<Record<keyof ChartSwitchView, unknown>>;
  const element = view.element as Node | undefined;
  return (
    (["marks", "labels", "focus", "destroy"] as const).every((method) => typeof view[method] === "function") &&
    element?.nodeType === 1 &&
    container.contains(element)
  );
}

/** Throws on options that aren't a switch's; returns the views' names. */
function checkOptions(options: ChartSwitchOptions<ChartSwitchViews>): string[] {
  if (typeof options !== "object" || options === null) throw new TypeError("chartSwitch needs options.");
  const { views, initial, transition, announce } = options;
  if (typeof views !== "object" || views === null) throw new TypeError("chartSwitch needs views: by name, a function that draws each view's chart in the container it's given.");
  const names = Object.keys(views);
  if (names.length === 0) throw new TypeError("chartSwitch needs at least one view.");
  for (const name of names) {
    if (typeof views[name] !== "function") throw new TypeError(`chartSwitch: views.${name} must be a function that draws the view's chart in the container it's given.`);
  }
  if (typeof initial !== "string" || !names.includes(initial)) {
    throw new TypeError(`chartSwitch: initial must be one of the views (${names.map((n) => JSON.stringify(n)).join(", ")}), got ${typeof initial === "string" ? JSON.stringify(initial) : String(initial)}.`);
  }
  if (!isTransitionEffect(transition)) throw new TypeError("chartSwitch: transition must be a transition effect, such as morph().");
  if (announce !== undefined && typeof announce !== "boolean") throw new TypeError("chartSwitch: announce must be true or false.");
  return names;
}
