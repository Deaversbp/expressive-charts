import { colorAssignment, toColorAssignment } from "./colors";

describe("colorAssignment", () => {
  it("gives keys slots in the order they're first seen, and never reassigns them", () => {
    const colors = colorAssignment();
    expect(colors.slot("assists")).toBe(1);
    expect(colors.slot("goals")).toBe(2);
    expect(colors.slot("assists")).toBe(1);
    expect(colors.slot("shots")).toBe(3);
  });

  it("keeps pinned slots and fills the free ones around them", () => {
    const colors = colorAssignment({ goals: 1, assists: 4 });
    expect(colors.slot("assists")).toBe(4);
    expect(colors.slot("shots")).toBe(2);
    expect(colors.slot("saves")).toBe(3);
    expect(colors.slot("tackles")).toBe(5);
    expect(colors.slot("goals")).toBe(1);
  });

  it("reuses slots in turn once all eight are taken", () => {
    const colors = colorAssignment();
    const slots = Array.from({ length: 10 }, (_, i) => colors.slot(`k${i}`));
    expect(slots).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 1, 2]);
  });

  it("rejects slots outside the palette", () => {
    expect(() => colorAssignment({ goals: 0 })).toThrow(RangeError);
    expect(() => colorAssignment({ goals: 9 })).toThrow(/from 1 to 8/);
    expect(() => colorAssignment({ goals: 1.5 })).toThrow(RangeError);
  });

  it("uses a shared assignment as is and pins a record", () => {
    const shared = colorAssignment();
    expect(toColorAssignment(shared)).toBe(shared);
    expect(toColorAssignment({ goals: 3 }).slot("goals")).toBe(3);
    expect(toColorAssignment(undefined).slot("goals")).toBe(1);
  });
});
