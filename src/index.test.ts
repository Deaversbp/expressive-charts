import { VERSION } from "./index";

describe("expressive-charts", () => {
  it("exposes a version", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("runs tests in a DOM environment", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    expect(svg.namespaceURI).toBe("http://www.w3.org/2000/svg");
  });
});
