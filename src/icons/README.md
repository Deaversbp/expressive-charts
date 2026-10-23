# icons

Icons for effects such as `travel`: path data plus paint, never raw markup. Each icon defines its natural size, the point that sits on the walk, the point it spins or tilts around, and its footprint. Users can register their own. Depends only on core; effects never import this folder.

| File | What it holds |
| --- | --- |
| `define.ts` | `defineIcon`: fills an icon's defaults, checks it and freezes it |
| `svg.ts` | `iconFromSvg`: keeps only plain shapes from SVG markup, safely |
| `core.ts` | The neutral core icons, `dot`, `arrow` and `chevron`, registered by name in every chart |
| `sport/` | The optional sport pack (`soccerBall`, `cleat`), its own entry point: `expressive-charts/icons/sport` |
