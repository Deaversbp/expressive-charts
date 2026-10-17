// Type-level checks: they run in `npm run typecheck`; at test time they're no-ops.

import type { MarkData } from "./data";
import type { AnyMarkEffect, Combined, DataEffect, EffectContext, GeometryEffect, MarkEffect, TransitionEffect } from "./effect";
import type { MarkGeometry } from "./geometry";

interface Region {
  region: string;
  revenue: number;
}
interface Team {
  team: string;
  points: number;
}

describe("effect contracts", () => {
  it("combines kinds: a data part makes the whole a data effect", () => {
    expectTypeOf<Combined<[GeometryEffect, GeometryEffect]>>().toEqualTypeOf<GeometryEffect>();
    expectTypeOf<Combined<[GeometryEffect, DataEffect<Region>]>>().toEqualTypeOf<DataEffect<Region>>();
    expectTypeOf<Combined<readonly [DataEffect<Region>]>>().toEqualTypeOf<DataEffect<Region>>();
    expectTypeOf<Combined<[]>>().toEqualTypeOf<GeometryEffect>();
  });

  it("needs every part's rows at once", () => {
    expectTypeOf<Combined<[DataEffect<Region>, DataEffect<Team>]>>().toEqualTypeOf<DataEffect<Region & Team>>();
    // A generic part can't widen a typed part's needs back to unknown.
    expectTypeOf<Combined<[DataEffect<Region>, DataEffect]>>().toEqualTypeOf<DataEffect<Region>>();
    expectTypeOf<Combined<DataEffect<Region>[]>>().toEqualTypeOf<DataEffect<Region>>();
  });

  it("checks data effects' row types strictly", () => {
    // An effect that needs more fields than the rows have doesn't fit.
    expectTypeOf<DataEffect<Region & { target: number }>>().not.toExtend<DataEffect<Region>>();
    expectTypeOf<DataEffect<Region>>().not.toExtend<DataEffect<Team>>();
    // A generic effect fits any rows.
    expectTypeOf<DataEffect>().toExtend<DataEffect<Region>>();
  });

  it("keeps transitions out of mark effects", () => {
    expectTypeOf<TransitionEffect>().not.toExtend<MarkEffect>();
    expectTypeOf<TransitionEffect>().not.toExtend<AnyMarkEffect>();
    expectTypeOf<GeometryEffect>().toExtend<MarkEffect<Region>>();
    expectTypeOf<DataEffect<Region>>().not.toExtend<GeometryEffect>();
  });

  it("gives data effects the data and geometry effects only the geometry", () => {
    expectTypeOf<DataEffect<Region>["run"]>().parameters.toEqualTypeOf<[MarkGeometry, MarkData<Region>, EffectContext]>();
    expectTypeOf<GeometryEffect["run"]>().parameters.toEqualTypeOf<[MarkGeometry, EffectContext]>();
  });
});
