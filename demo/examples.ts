// The examples page: three cards on the library's own charts, a domain each, built by
// demo/examples-cards.ts. This file wires the page's two buttons and its motion switch. At load
// everything is at rest, and nothing plays until a button is clicked.
import { motionSwitch } from "../src/index";
import { heightCard, revenueCard, sessionsCard, type Quarter } from "./examples-cards";

// The viewer's own choice of mode, which wins over the device's reduced-motion setting.
motionSwitch("#motion");

// ── Business ─────────────────────────────────────────────────────────────────

const revenue = revenueCard("#revenue");
const quarterButton = document.querySelector<HTMLButtonElement>("#quarter");
const quarterStatus = document.querySelector<HTMLElement>("#quarter-status");

/** The button names what a click does; the status says the quarter on show. */
function showQuarter(): void {
  if (quarterButton) quarterButton.textContent = revenue.quarter === "Q3 2026" ? "Play Q4" : "Back to Q3";
  if (quarterStatus) quarterStatus.textContent = revenue.quarter;
}
showQuarter();

quarterButton?.addEventListener("click", () => {
  const next: Quarter = revenue.quarter === "Q3 2026" ? "Q4 2026" : "Q3 2026";
  // A click part way through carries on from where the bars are.
  void revenue.show(next);
  showQuarter();
});

// The labels' words follow the card's width: "105% of target" where there's room, "105%" at 320 px.
const revenueHost = document.querySelector<HTMLElement>("#revenue");
if (revenueHost && typeof ResizeObserver === "function") new ResizeObserver(() => revenue.fit(revenueHost.clientWidth)).observe(revenueHost);

// ── Science ──────────────────────────────────────────────────────────────────

heightCard("#height");

// ── Web analytics ────────────────────────────────────────────────────────────

const sessions = sessionsCard("#sessions");
const viewButton = document.querySelector<HTMLButtonElement>("#view");

/** The button names the view a click goes to. `current` is the view a switch is heading for. */
function showView(): void {
  if (viewButton) viewButton.textContent = sessions.current === "donut" ? "Show as bars" : "Show as donut";
}
showView();

/** Switches to the other view. A second switch part way goes back from where the shapes are. */
function toggleView(): void {
  void sessions.show(sessions.current === "donut" ? "bars" : "donut");
  showView();
}
viewButton?.addEventListener("click", toggleView);

// With a slice or a bar focused, V switches too, and focus follows its source into the other view.
// The button can't do that: a click moves focus to it.
document.querySelector("#sessions")?.addEventListener("keydown", (event) => {
  const { key, altKey, ctrlKey, metaKey } = event as KeyboardEvent;
  if ((key !== "v" && key !== "V") || altKey || ctrlKey || metaKey) return;
  if (!(event.target instanceof Element) || !event.target.closest(".ec-mark")) return;
  event.preventDefault();
  toggleView();
});
