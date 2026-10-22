// The conformance checks from plan §8, through checkEffect, for every built-in effect on every kind
// of mark (the testing entry's fixtures): a full run ends with the same picture and mark style as
// end(), clearing leaves nothing, an abort mid-run settles, and with motion off no frames run.

import type { GeometryEffect, Icon } from "../core";
import { checkEffect, type CheckEffectOptions } from "../testing";
import { parallel, sequence, stagger } from "./combinators";
import { flash } from "./flash";
import { pulse } from "./pulse";
import { travel } from "./travel";
import { wiggle } from "./wiggle";

// Test icons, written out so the effect tests don't depend on src/icons.
const ball: Icon = {
  name: "ball",
  shapes: [{ d: "M5,0A5,5 0 0 1 -5,0A5,5 0 0 1 5,0Z", fill: "#ffffff" }],
  box: { x: -5, y: -5, width: 10, height: 10 },
  size: 10,
  anchor: { x: 0, y: 0 },
  pivot: { x: 0, y: 0 },
  footprint: [5, 5],
  gait: "roll",
  radius: 5
};
const boot: Icon = {
  name: "boot",
  shapes: [{ d: "M0,0L20,0L20,-10L0,-10Z", fill: "#222222" }],
  box: { x: 0, y: -10, width: 20, height: 12 },
  size: 20,
  anchor: { x: 0, y: -4 },
  pivot: { x: 10, y: -3 },
  footprint: [0, 20],
  gait: "step",
  upright: true
};
/** No gait of its own, so it slides. */
const flag: Icon = { ...ball, name: "flag", gait: undefined, radius: undefined };

const effects: Record<string, GeometryEffect> = {
  roll: travel(ball),
  "roll, the icon by name": travel("ball"),
  step: travel(boot),
  "level slide": travel(flag, { orient: "level" }),
  "fit, riding on": travel(ball, { size: "fit", ride: "on" }),
  "along assists": travel(boot, { along: "assists" }),
  "ball then boot": sequence(travel(ball, { along: "goals" }), travel(boot, { along: "assists" })),
  flash: flash(),
  "flash in a colour": flash({ width: 12, opacity: 0.5, color: "series-3" }),
  "flash while the ball rolls": parallel(flash(), travel(ball, { along: "goals" })),
  wiggle: wiggle(),
  "wiggle by 1 px": wiggle({ swing: 1 }),
  pulse: pulse(),
  "pulse once in a colour": pulse({ times: 1, color: "series-3" }),
  "staggered flash, third of five": stagger(flash())
};

/** More than the defaults, where an effect needs it: icons looked up by name, or a later mark of a batch. */
const options: Record<string, CheckEffectOptions> = {
  "roll, the icon by name": { icons: [ball] },
  "staggered flash, third of five": { batch: { index: 2, count: 5 } }
};

describe.each(Object.entries(effects))("%s", (name, effect) => {
  it("passes the conformance checks on every kind of mark", async () => {
    await checkEffect(effect, { name, ...options[name] });
  });
});
