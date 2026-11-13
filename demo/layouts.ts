// Five layout morphs, four from docs/ideas/effects-by-chart.md, each on charts drawn with D3 by modules
// that know nothing about expressive-charts, in a chart switch through hostView(): bars side by side,
// stacked and as shares of 100%; areas stacked and as shares; a radar into bars; a treemap into bars;
// and the charts page's dumbbell, three attachments in one view, into bars. The treemap drills into a
// position too: a staged jump through that position's tiles alone. demo/layouts-effects.ts has each
// card's views, which src/layouts.test.ts builds too. Each card loads at rest in its first view and
// moves only on its buttons, V, or a click or Enter on a tile: nothing plays by itself.
import { chartSwitch, morph, motionSwitch, type ChartSwitch } from "../src/index";
import { areasCard, barsCard, dumbbellCard, radarCard, treemapCard, treemapDrill, type LayoutCard, type TreemapPressed } from "./layouts-effects";

/** Wires a row of toggle buttons; returns a function that shows a value as pressed. */
function segmented(id: string, onPick: (value: string) => void): (value: string) => void {
  const group = document.getElementById(id);
  const buttons = Array.from(group?.querySelectorAll<HTMLButtonElement>("button") ?? []);
  const show = (value: string): void => {
    for (const button of buttons) button.setAttribute("aria-pressed", String(button.dataset.value === value));
  };
  for (const button of buttons) {
    button.addEventListener("click", () => onPick(button.dataset.value ?? ""));
  }
  return show;
}

/**
 * A card's switch in `#id`, in its first view, with morph()'s default mapping, unroll, and the view
 * it lands on announced. Its buttons (`#id-layout`) switch, staged through `via` for a jump of two, and
 * show the view it's heading for as pressed; focus stays on them. With a mark focused, V goes to the
 * view after the one it's heading for in `order`, and focus follows the mark's key.
 */
function layoutSwitch<V extends string>(id: string, card: LayoutCard<V>, order: readonly V[], via?: V): ChartSwitch<LayoutCard<V>["views"]> {
  const switcher = chartSwitch(`#${id}`, { views: card.views, initial: order[0]!, transition: morph(), announce: true });
  const go = (view: V): void => {
    void switcher.show(view, via === undefined ? undefined : { via });
    pressed(switcher.current);
  };
  const pressed = segmented(`${id}-layout`, (value) => go(value as V));
  pressed(switcher.current);
  // The buttons can't take focus along: a click moves focus to them, and focus that has left the switch
  // stays put. The D3 charts' marks are the elements expressive() names.
  document.getElementById(id)?.addEventListener("keydown", (event) => {
    const { key, altKey, ctrlKey, metaKey, target } = event;
    if ((key !== "v" && key !== "V") || altKey || ctrlKey || metaKey) return;
    if (!(target instanceof SVGElement) || target.getAttribute("role") !== "img") return;
    event.preventDefault();
    go(order[(order.indexOf(switcher.current) + 1) % order.length]!);
  });
  return switcher;
}

const bars = barsCard();
const areas = areasCard();
const radar = radarCard();
const treemap = treemapCard();
const dumbbell = dumbbellCard();

// The bars go side by side → stacked → 100% → side by side, the last through Stacked, and so does a
// jump of two from the buttons.
layoutSwitch("bars", bars, ["side", "stacked", "share"], "stacked");
layoutSwitch("areas", areas, ["stacked", "share"]);
layoutSwitch("radar", radar, ["radar", "bars"]);
layoutSwitch("dumbbell", dumbbell, ["dumbbell", "bars"]);

// The treemap card's switch has two views more a position, for its drill-down, and two rows of buttons:
// Treemap and Bars, and All and each position. treemapDrill() stages each jump and listens for a click
// or Enter on a tile, Escape and V; the rows show the view the switch is heading for.
const treemapSwitch = chartSwitch("#treemap", { views: treemap.views, initial: "treemap", transition: morph(), announce: true });
const drill = treemapDrill(document.getElementById("treemap")!, treemapSwitch, () => {
  const { layout, position } = drill.pressed();
  layoutPressed(layout);
  positionPressed(position);
});
const layoutPressed = segmented("treemap-layout", (value) => drill.layout(value as TreemapPressed["layout"]));
const positionPressed = segmented("treemap-position", (value) => drill.position(value as TreemapPressed["position"]));

// The D3 charts draw at their container's width, so they draw again when it changes, and refresh()
// reads their marks again. A switch playing keeps their new marks hidden (hostView()), and the resize
// lands it.
window.addEventListener("resize", () => {
  for (const card of [bars, areas, radar, treemap, dumbbell]) card.redraw();
});

// The motion switch is the viewer's own choice, so it overrides the device's reduced-motion setting.
motionSwitch("#motion");
