// Shared geometry types. The full MarkGeometry contract (docs/plan.md §2.2) lands here in M1 step 3.

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
