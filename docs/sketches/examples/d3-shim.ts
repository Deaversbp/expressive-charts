// The few D3 shapes the adapter examples rely on, so the sketch needs no dependency.

export interface Selection<E extends Element, D> {
  nodes(): E[];
  data(): D[];
}

/** One rect's datum from d3.stack(): [start, end] with the original row on .data. */
export type SeriesPoint<T> = [number, number] & { data: T };

/** One slice's datum from d3.pie(). */
export interface PieArc<T> {
  data: T;
  startAngle: number;
  endAngle: number;
}
