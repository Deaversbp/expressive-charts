// The data channel: only data effects receive this (CLAUDE.md rule 8).

export interface Sample {
  /** Where along the walk, in [0, 1]. */
  readonly t: number;
  readonly value: number;
  /** The x value or label behind the sample (a week, a date). */
  readonly at?: string | number | Date;
}

export interface MarkData<D = unknown> {
  /** The row behind the mark. A line series gets all its rows. */
  readonly datum: D;
  /** Data values along the walk, t ascending. */
  readonly samples: readonly Sample[];
  /** Another series in the same chart, if it exists. */
  related(series: string): MarkData<D> | undefined;
  /** The values before this update, for update effects that show change. */
  readonly previous?: MarkData<D>;
}
