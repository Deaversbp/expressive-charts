// Numbers as a chart shows them: the `format` option or its default, and the rounding a counting label
// uses between two values.

/** The chart's `format`, or the default: the locale's, to at most 2 decimals. */
export function format(options: { readonly format?: ((value: number) => string) | undefined }): (value: number) => string {
  return options.format ?? defaultFormat;
}

let numberFormat: Intl.NumberFormat | undefined;
function defaultFormat(value: number): string {
  numberFormat ??= new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
  return numberFormat.format(value);
}

/** Decimal places a value is given to, up to 6: a counting label shows whole numbers between whole totals. */
export function decimals(value: number): number {
  const text = String(Number(value.toPrecision(12)));
  if (/e/i.test(text)) return 6;
  const point = text.indexOf(".");
  return point < 0 ? 0 : Math.min(6, text.length - point - 1);
}

export function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  // No "-0" on a label counting down to zero.
  return rounded === 0 ? 0 : rounded;
}
