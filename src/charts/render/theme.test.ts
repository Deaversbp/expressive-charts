import { cssColor, injectStyles, PALETTE_SIZE, seriesColors, styleOptions, stylesheet, themes, type Theme } from "./theme";

// ── Colour maths, for checking the palette ──────────────────────────────────

type Rgb = readonly [number, number, number];

/** sRGB hex to linear RGB. */
function linear(hex: string): Rgb {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return [channel(1), channel(3), channel(5)];
}

/** WCAG 2 contrast ratio. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, b] = linear(hex);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** OKLab from linear RGB. */
function oklab([r, g, b]: Rgb): Rgb {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  ];
}

const hue = (hex: string): number => {
  const [, a, b] = oklab(linear(hex));
  return (Math.atan2(b, a) * 180) / Math.PI;
};

type Vision = "normal" | "protanopia" | "deuteranopia" | "tritanopia";

/** Machado, Oliveira and Fernandes (2009), severity 1, in linear RGB. */
const DEFICIENCY: Record<Exclude<Vision, "normal">, readonly Rgb[]> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998]
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881]
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039]
  ]
};

function seen(hex: string, vision: Vision): Rgb {
  const rgb = linear(hex);
  if (vision === "normal") return rgb;
  const clamp = (c: number) => Math.min(1, Math.max(0, c));
  return DEFICIENCY[vision].map((row) => clamp(row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2])) as unknown as Rgb;
}

/** Distance in OKLab ×100: about 2 is just noticeable; 8 or more is clear for neighbouring marks. */
function distance(a: string, b: string, vision: Vision = "normal"): number {
  const [p, q] = [oklab(seen(a, vision)), oklab(seen(b, vision))];
  return 100 * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

// ── The palette ─────────────────────────────────────────────────────────────

describe.each(Object.entries(themes) as [string, Theme][])("the %s theme", (_name, theme) => {
  const colors = theme.series.map(([color]) => color);

  it("has eight slots", () => {
    expect(theme.series).toHaveLength(PALETTE_SIZE);
  });

  it("gives every mark colour at least 3:1 against the surface", () => {
    for (const [color, strong] of theme.series) {
      expect(contrast(color, theme.surface), color).toBeGreaterThanOrEqual(3);
      expect(contrast(strong, theme.surface), strong).toBeGreaterThanOrEqual(3);
    }
    expect(contrast(theme.negative, theme.surface)).toBeGreaterThanOrEqual(3);
    expect(contrast(theme.focus, theme.surface)).toBeGreaterThanOrEqual(3);
  });

  it("gives text at least 4.5:1 against the surface", () => {
    expect(contrast(theme.text, theme.surface)).toBeGreaterThanOrEqual(4.5);
    // Tick labels are 11 px.
    expect(contrast(theme["text-muted"], theme.surface)).toBeGreaterThanOrEqual(4.5);
  });

  // Stacked segments and neighbouring series take neighbouring slots, and slot 8 meets slot 1 when the palette wraps.
  it.each<Vision>(["normal", "protanopia", "deuteranopia", "tritanopia"])("keeps neighbouring slots apart with %s", (vision) => {
    const floor = vision === "normal" ? 15 : 8;
    colors.forEach((color, i) => {
      const next = colors[(i + 1) % colors.length]!;
      expect(distance(color, next, vision), `${color} and ${next}`).toBeGreaterThanOrEqual(floor);
    });
  });

  it("has no two slots alike", () => {
    colors.forEach((a, i) => colors.slice(i + 1).forEach((b) => expect(distance(a, b), `${a} and ${b}`).toBeGreaterThanOrEqual(9)));
  });

  it("makes each -strong variant an emphasis of its colour: the same hue, nearer the text colour", () => {
    for (const [color, strong] of theme.series) {
      const label = `${color} and ${strong}`;
      expect(Math.abs(((hue(strong) - hue(color) + 540) % 360) - 180), label).toBeLessThan(5);
      expect(contrast(strong, theme.surface) / contrast(color, theme.surface), label).toBeGreaterThanOrEqual(1.3);
      expect(distance(color, strong), label).toBeGreaterThanOrEqual(8);
    }
  });
});

describe("theme tokens", () => {
  it("fall back to light, for a page without the stylesheet", () => {
    expect(seriesColors(3)).toEqual({ color: "var(--ec-series-3, #02a471)", strong: "var(--ec-series-3-strong, #07835a)" });
    expect(seriesColors(PALETTE_SIZE + 1)).toEqual(seriesColors(1));
    expect(cssColor("text-muted")).toBe("var(--ec-text-muted, #75736d)");
    expect(cssColor("series-8-strong")).toBe("var(--ec-series-8-strong, #a32f7a)");
    expect(cssColor("mark")).toBe("var(--ec-mark, var(--ec-series-1, #2a78d6))");
    expect(cssColor("#123456")).toBe("#123456");
  });
});

// ── The stylesheet ──────────────────────────────────────────────────────────

/** The stylesheet's rules, parsed: style rules, and the ones inside @media with the media text. */
function rules(): { selector: string; media?: string; style: CSSStyleDeclaration }[] {
  // A frame's document, which parses its stylesheets (a bare createHTMLDocument() doesn't).
  const frame = document.body.appendChild(document.createElement("iframe"));
  const doc = frame.contentDocument!;
  const style = doc.head.appendChild(doc.createElement("style"));
  style.textContent = stylesheet;
  const out: { selector: string; media?: string; style: CSSStyleDeclaration }[] = [];
  // By shape: the frame's CSSStyleRule isn't this window's.
  const visit = (list: CSSRuleList, media?: string) => {
    for (const rule of Array.from(list)) {
      if ("selectorText" in rule) out.push({ selector: (rule as CSSStyleRule).selectorText, media, style: (rule as CSSStyleRule).style });
      else if ("media" in rule) visit((rule as CSSMediaRule).cssRules, (rule as CSSMediaRule).media.mediaText);
      else throw new Error(`unexpected rule: ${rule.cssText}`);
    }
  };
  visit(style.sheet!.cssRules);
  frame.remove();
  return out;
}

/** Without spaces: the parser drops some ("rgba(11,11,11,0.1)"). */
const squash = (value: string) => value.replace(/\s+/g, "");

/** The custom properties a rule declares. */
function tokens(style: CSSStyleDeclaration): Record<string, string> {
  return Object.fromEntries(Array.from(style, (name) => [name, squash(style.getPropertyValue(name))]).filter(([name]) => name!.startsWith("--ec-")));
}

function expected(theme: Theme): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of ["surface", "text", "text-muted", "grid", "axis", "focus", "negative", "ring", "dim-opacity"] as const) out[`--ec-${name}`] = squash(theme[name]);
  theme.series.forEach(([color, strong], i) => {
    out[`--ec-series-${i + 1}`] = color;
    out[`--ec-series-${i + 1}-strong`] = strong;
  });
  return out;
}

describe("the stylesheet", () => {
  afterEach(() => {
    styleOptions.nonce = undefined;
    styleOptions.injectStyles = undefined;
  });

  it("has zero specificity: every selector is in :where()", () => {
    const all = rules();
    expect(all.length).toBeGreaterThan(20);
    for (const { selector } of all) expect(selector).toMatch(/^:where\(.*\)$/);
  });

  it("sets light on the root and on data-theme=light, dark when the device prefers it, and dark on data-theme=dark", () => {
    const all = rules();
    const light = all.find((r) => r.selector === ':where(:root, [data-theme="light"])');
    const preferred = all.find((r) => r.media === "(prefers-color-scheme: dark)");
    const dark = all.find((r) => r.selector === ':where([data-theme="dark"])');
    expect(tokens(light!.style)).toEqual(expected(themes.light));
    // data-theme="light" on the root beats the device's preference.
    expect(preferred!.selector).toBe(':where(:root:not([data-theme="light"]))');
    expect(tokens(preferred!.style)).toEqual(expected(themes.dark));
    expect(tokens(dark!.style)).toEqual(expected(themes.dark));
    // In source order, so data-theme="dark" beats a light root, and the media rule never touches a nested data-theme.
    expect(all.indexOf(light!)).toBeLessThan(all.indexOf(preferred!));
    expect(all.indexOf(preferred!)).toBeLessThan(all.indexOf(dark!));
  });

  it("gives the pressed motion mode the viewer's selection colours under forced colours", () => {
    const forced = rules().filter((r) => r.media === "(forced-colors: active)");
    expect(forced.map((r) => [r.selector, r.style.getPropertyValue("background-color").toLowerCase(), r.style.getPropertyValue("color").toLowerCase()])).toEqual([
      [':where(.ec-motion-modes button[aria-pressed="true"])', "highlight", "highlighttext"]
    ]);
  });

  it("is injected once per document, with the page's nonce if there is one", () => {
    styleOptions.nonce = "r4nd0m";
    const doc = document.implementation.createHTMLDocument();
    injectStyles(doc);
    injectStyles(doc);
    const injected = doc.querySelectorAll("style[data-expressive-charts]");
    expect(injected).toHaveLength(1);
    expect(injected[0]!.getAttribute("nonce")).toBe("r4nd0m");
    expect(injected[0]!.textContent).toBe(stylesheet);

    styleOptions.nonce = undefined;
    const plain = document.implementation.createHTMLDocument();
    injectStyles(plain);
    expect(plain.querySelector("style[data-expressive-charts]")!.hasAttribute("nonce")).toBe(false);
  });

  it("isn't injected with injectStyles: false", () => {
    styleOptions.injectStyles = false;
    const doc = document.implementation.createHTMLDocument();
    injectStyles(doc);
    expect(doc.querySelector("style")).toBeNull();
  });
});
