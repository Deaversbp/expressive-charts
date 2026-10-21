// The Node globals the Playwright config reads. The repo has no Node types (the library never runs
// Node code), so they're typed here, in the visual suite's own tsconfig, out of the library's reach.
declare const process: {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly platform: string;
};
