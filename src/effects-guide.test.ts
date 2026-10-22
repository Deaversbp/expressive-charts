// @vitest-environment node
// The worked examples in docs/effects-guide.md, trace and delta, pass the conformance suite, and the
// guide shows them as they are in docs/sketches/examples/effects, where `npm run typecheck` checks
// them. They import "expressive-charts", as an author's code would; vitest.config.ts points that at
// src/index.ts. They bring in the whole library, so this test lives beside src/index.ts.

import type { DataEffect, GeometryEffect, MarkData } from "./index";
import { checkEffect, fixtures, play, testContext } from "./testing";

interface Examples {
  readonly trace: (color?: string) => GeometryEffect;
  readonly delta: (format?: (n: number) => string) => DataEffect;
}

/** Imported at run time, with the path as a plain string, so the main typecheck leaves them to the sketches' tsconfig. */
async function examples(): Promise<Examples> {
  const [{ trace }, { delta }] = (await Promise.all([
    import("../docs/sketches/examples/effects/trace.ts" as string),
    import("../docs/sketches/examples/effects/delta.ts" as string)
  ])) as [Pick<Examples, "trace">, Pick<Examples, "delta">];
  return { trace, delta };
}

/** A file's text, from the repository's root, with Unix line endings. */
async function read(path: string): Promise<string> {
  // Node APIs aren't typed in this repo (the library never runs Node code), so the one used is typed here.
  const fs = (await import("node:fs/promises" as string)) as { readFile(path: URL, encoding: "utf8"): Promise<string> };
  const root = new URL("../package.json", import.meta.url);
  return (await fs.readFile(new URL(path, root), "utf8")).replace(/\r\n/g, "\n");
}

/** A mark's data with its last value, and the one before the update. */
const values = (value: number, previous?: number): MarkData => ({
  datum: undefined,
  samples: [{ t: 1, value }],
  related: () => undefined,
  ...(previous === undefined ? {} : { previous: values(previous) })
});

describe("the effects guide's worked examples", () => {
  it("trace passes the conformance checks", async () => {
    const { trace } = await examples();
    await checkEffect(trace(), { name: "trace" });
    await checkEffect(trace("text-muted"), { name: "trace in a colour" });
  });

  it("delta passes the conformance checks, whether the value changed or not", async () => {
    const { delta } = await examples();
    await checkEffect(delta(), { name: "delta" });
    await checkEffect(delta(), { name: "delta, 14 → 16", data: () => values(16, 14) });
    await checkEffect(delta(), { name: "delta, unchanged", data: () => values(16, 16) });
  });

  it("delta labels the change beyond the mark's end", async () => {
    const { delta } = await examples();
    const ctx = testContext();
    await play(ctx.clock, delta().run(fixtures.bar, values(16, 14), ctx));
    expect(ctx.layer.picture()).toEqual([{ kind: "text", content: "+2", style: { at: { x: 210, y: 10 }, anchor: "start", opacity: 1 } }]);
  });

  it("are shown in the guide as they are in the type-checked files", async () => {
    const guide = await read("docs/effects-guide.md");
    for (const name of ["trace", "delta"]) {
      const source = (await read(`docs/sketches/examples/effects/${name}.ts`)).trim();
      expect(guide, `${name}.ts`).toContain("```ts\n" + source + "\n```");
    }
  });
});
