// world-atlas ships its borders as JSON with no types. Vite reads the file as a module; this says what
// it is, so `typecheck` needs neither `resolveJsonModule` nor the 108 KB file's own inferred type.
declare module "world-atlas/countries-110m.json" {
  const topology: import("topojson-specification").Topology<{ countries: import("topojson-specification").GeometryCollection<{ name: string }> }>;
  export default topology;
}
