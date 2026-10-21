import { cleat, soccerBall, sport } from "./index";

describe("the sport icon pack", () => {
  it("has the ball and the cleat, set up as in plan §6", () => {
    expect(sport).toEqual([soccerBall, cleat]);
    expect(soccerBall).toMatchObject({
      name: "soccer-ball",
      anchor: { x: 0, y: 0 },
      pivot: { x: 0, y: 0 },
      footprint: [8.5, 8.5],
      gait: "roll",
      radius: 8.5,
      size: 17
    });
    expect(soccerBall.upright).toBeUndefined();
    expect(cleat).toMatchObject({
      name: "cleat",
      anchor: { x: 0, y: -6 },
      pivot: { x: 13, y: -4 },
      footprint: [0, 26],
      gait: "step",
      upright: true,
      size: 26
    });
  });

  it("draws the ball as the prototype does: white, with panels clipped to its edge", () => {
    const [body, panels, seams, rim] = soccerBall.shapes;
    expect(body).toEqual({ d: "M8.5,0A8.5,8.5 0 0 1 -8.5,0A8.5,8.5 0 0 1 8.5,0Z", fill: "#ffffff" });
    expect(panels!.clip).toBe(body!.d);
    // Six pentagons: the centre one points up from (0, −3.3).
    expect(panels!.d.startsWith("M0,-3.3L")).toBe(true);
    expect(panels!.d.match(/M/g)).toHaveLength(6);
    expect(seams!.d.match(/M/g)).toHaveLength(5);
    expect(rim).toMatchObject({ stroke: "#1d1c1a", width: 1 });
    expect(rim!.fill).toBeUndefined();
  });

  it("draws the cleat with its sole on y = 0 and four studs below it", () => {
    const [boot, laces, stitching, studs] = cleat.shapes;
    expect(boot).toMatchObject({ fill: "#24221f", stroke: "#ffffff", width: 0.9, linejoin: "round" });
    expect(laces).toMatchObject({ stroke: "#ffffff", linecap: "round" });
    expect(stitching!.d).toBe("M12.3,-11L14.7,-11.6M13.3,-9.6L15.7,-10.1");
    expect(studs!.d.match(/M/g)).toHaveLength(4);
    expect(studs!.d.startsWith("M4.6,0L5.6,0A0.6,0.6 0 0 1 6.2,0.6")).toBe(true);
  });
});
