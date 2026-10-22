import { createMotion, manualClock, playback, type MotionMode } from "../../core";
import { playButton } from "./play-button";

const allowsMotion = { matches: false, subscribe: () => () => {} };

/** A season from week 1 to 38 over 6.5 s on a manual clock, and a target in the page. */
function setup(mode: MotionMode = "presentation") {
  const clock = manualClock();
  const motion = createMotion({ mode, reducedMotion: allowsMotion });
  const season = playback({ from: 1, to: 38, duration: 6500, clock, motion, onFrame: () => {} });
  const target = document.body.appendChild(document.createElement("div"));
  return { clock, motion, season, target };
}

afterEach(() => {
  document.body.replaceChildren();
  document.head.querySelectorAll("style[data-expressive-charts]").forEach((style) => style.remove());
});

describe("playButton", () => {
  it("builds one real button in the target, named Play, with no aria-pressed", () => {
    const { season, target } = setup();
    const { element } = playButton(target, season);
    expect(element.parentElement).toBe(target);
    expect(element.tagName).toBe("BUTTON");
    expect(element.type).toBe("button");
    expect(element.className).toBe("ec-play");
    expect(element.textContent).toBe("Play");
    expect(element.hasAttribute("aria-pressed")).toBe(false);
    expect(document.head.querySelector("style[data-expressive-charts]")?.textContent).toContain(".ec-play");
  });

  it("plays and pauses on click, keeping its text and focus right through to the end", () => {
    const { clock, season, target } = setup();
    const { element } = playButton(target, season, { labels: { play: "Play season" } });
    element.focus();
    expect(element.textContent).toBe("Play season");

    element.click();
    expect(season.playing).toBe(true);
    expect(element.textContent).toBe("Pause");
    clock.advance(1000);

    element.click();
    expect(season.playing).toBe(false);
    expect(element.textContent).toBe("Play season");
    const paused = season.position;
    clock.advance(1000);
    expect(season.position).toBe(paused);

    element.click();
    expect(element.textContent).toBe("Pause");
    clock.advance(6500);
    expect(season.position).toBe(38);
    expect(element.textContent).toBe("Play season");

    // The same element throughout, so focus never moves.
    expect(document.activeElement).toBe(element);
    expect(target.querySelectorAll("button")).toHaveLength(1);
  });

  it("follows the playback whoever drives it: the page's code or a scrubber's seek", () => {
    const { season, target } = setup();
    const { element } = playButton(target, season);
    season.play();
    expect(element.textContent).toBe("Pause");
    season.seek(12);
    expect(element.textContent).toBe("Play");
  });

  it("stays at Play with motion off, where a play ends at once", () => {
    const { season, target } = setup("off");
    const { element } = playButton(target, season);
    season.seek(10, { animate: false });
    element.click();
    expect(season.position).toBe(38);
    expect(element.textContent).toBe("Play");
  });

  it("takes the page's words for both states", () => {
    const { clock, season, target } = setup();
    const { element } = playButton(target, season, { labels: { play: "Lecture", pause: "Pause saison" } });
    expect(element.textContent).toBe("Lecture");
    element.click();
    expect(element.textContent).toBe("Pause saison");
    clock.advance(6500);
    expect(element.textContent).toBe("Lecture");
  });

  it("finds its target by selector", () => {
    const { season, target } = setup();
    target.id = "controls";
    expect(playButton("#controls", season).element.parentElement).toBe(target);
  });

  it("removes itself on destroy and stops following the playback, which carries on", () => {
    const { clock, season, target } = setup();
    const control = playButton(target, season);
    control.element.click();
    control.destroy();
    control.destroy();
    expect(target.childElementCount).toBe(0);
    expect(season.playing).toBe(true);
    clock.advance(6500);
    expect(control.element.textContent).toBe("Pause");
  });

  it("checks what it's given", () => {
    const { season, target } = setup();
    expect(() => playButton("#nowhere", season)).toThrow(/no element matches "#nowhere"/);
    expect(() => playButton(42 as unknown as Element, season)).toThrow(TypeError);
    expect(() => playButton(target, {} as typeof season)).toThrow(/needs a Playback/);
    expect(() => playButton(target, season, { labels: { play: "" } })).toThrow(/labels.play/);
    expect(() => playButton(target, season, { labels: { pause: 3 as unknown as string } })).toThrow(/labels.pause/);
    expect(target.childElementCount).toBe(0);
  });
});
