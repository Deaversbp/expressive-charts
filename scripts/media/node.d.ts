// The Node APIs the capture uses. The repo has no Node types (the library never runs Node code), so
// they're typed here, as tests/visual/node.d.ts types the Playwright config's.
declare module "node:zlib" {
  export function inflateSync(data: Uint8Array): Uint8Array;
}

declare module "node:fs" {
  export function mkdirSync(path: URL, options: { recursive: true }): void;
  export function writeFileSync(path: URL, data: Uint8Array): void;
}

declare const process: {
  readonly env: Readonly<Record<string, string | undefined>>;
};
