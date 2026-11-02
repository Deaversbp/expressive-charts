// The chart's data table: the fallback that every screen reader can read, whatever it makes of ARIA
// in SVG. A closed <details> "Data table" after the chart, or, with `table: "hidden"`, a table that's
// visually hidden but still read. Its rows are the chart's, in visual order, so it follows the sort;
// its columns are the category (each row's header), any extra columns the page lists, each series,
// and the total of a stack, in the chart's format, then any columns the page puts after the values.
// A donut adds each row's share and a total row. A line's missing value says its word, "missing" by
// default. Text is only ever set as text, never parsed as HTML.

import { percent } from "./shell/format";
import type { ChartOptions, TableColumn, TableOptions } from "./types";

/** The `table` option. */
export type TableOption<D> = ChartOptions<D>["table"];

/** A row as the chart has it. */
export interface TableRow<D> {
  readonly key: string;
  readonly category: string;
  readonly datum: D;
  /** Its index in `data`. */
  readonly index: number;
  readonly values: readonly { readonly series: string; readonly value: number }[];
  /** The series with no value in this row, a line chart's gaps: their cells say the input's `missing`. */
  readonly missing?: ReadonlySet<string>;
  readonly total: number;
}

export interface TableInput<D> {
  readonly option: TableOption<D>;
  /** The chart's label. */
  readonly caption: string;
  /** The category's field name, when a field gives it: the column's default header. */
  readonly category: string | undefined;
  /** In stack order. */
  readonly series: readonly string[];
  /** A series' column header when `table.series` has none: its label. Default: the series' own name. */
  readonly label?: (series: string) => string;
  /** In visual order. */
  readonly rows: readonly TableRow<D>[];
  readonly format: (value: number) => string;
  /**
   * Whether there's a Total column after the series, each row's values added up. Default: when
   * there's more than one series, as a stack has. A line chart's series don't add up, so it has none.
   */
  readonly total?: boolean;
  /**
   * A donut's: a Share column after the values, each row's share of the rows' total as a whole
   * percent, and a total row in <tfoot>: "Total", the values added up, and 100%.
   */
  readonly shares?: boolean;
  /** The word in a missing value's cell: a line chart's `missing`. Default "missing". */
  readonly missing?: string;
}

export interface TableCell {
  readonly text: string;
  /** Right-aligned. */
  readonly numeric: boolean;
}

/** What the table shows: headers, then each row's cells, the first of which is the row's header. */
export interface TableModel {
  readonly hidden: boolean;
  readonly summary: string;
  readonly caption: string;
  readonly headers: readonly TableCell[];
  readonly rows: readonly { readonly key: string; readonly cells: readonly TableCell[] }[];
  /** The total row's cells, in <tfoot>; the first is its header. */
  readonly footer?: readonly TableCell[];
}

export interface ChartTable {
  /**
   * Shows `model` after the chart's <svg>, or removes the table when it's undefined. Rows are kept by
   * key and only what changed is written, so an open table, and a screen reader's place in it, stay.
   */
  render(model: TableModel | undefined): void;
  destroy(): void;
}

/** Throws on a `table` option that isn't true, false, "hidden" or a valid object. `chart` names the chart in the message. */
export function checkTableOption(option: unknown, chart: string): void {
  if (option === undefined || typeof option === "boolean" || option === "hidden") return;
  const fail = (what: string): never => {
    throw new TypeError(`${chart}: ${what}`);
  };
  if (typeof option !== "object" || option === null) fail('table must be true, false, "hidden" or an object of table options.');
  const { hidden, columns, category, total, share, summary, series } = option as TableOptions<unknown>;
  if (hidden !== undefined && typeof hidden !== "boolean") fail("table.hidden must be true or false.");
  for (const [name, text] of Object.entries({ category, total, share, summary })) {
    if (text !== undefined && typeof text !== "string") fail(`table.${name} must be a string.`);
  }
  if (series !== undefined) {
    if (typeof series !== "object" || series === null || Array.isArray(series)) fail('table.series must be an object of headers by series, as { shots: "Shots" }.');
    for (const [name, header] of Object.entries(series)) {
      if (typeof header !== "string") fail(`table.series.${name} must be a string: the column's header.`);
    }
  }
  if (columns === undefined) return;
  if (!Array.isArray(columns)) fail("table.columns must be an array of { label, field }.");
  columns.forEach((entry: Partial<TableColumn<unknown>> | null, i: number) => {
    const column = typeof entry === "object" && entry !== null ? entry : fail(`table.columns[${i}] must be an object with a label and a field.`);
    if (typeof column.label !== "string") fail(`table.columns[${i}].label must be a string: the column's header.`);
    if (typeof column.field !== "string" && typeof column.field !== "function") fail(`table.columns[${i}].field must be a field name or a function of the row.`);
    if (column.format !== undefined && typeof column.format !== "function") fail(`table.columns[${i}].format must be a function.`);
    if (column.after !== undefined && column.after !== "category" && column.after !== "values") fail(`table.columns[${i}].after must be "category" or "values".`);
  });
}

/** A missing value's word by default: a word in its cell, so it's heard as missing, not as an empty cell. */
export const MISSING = "missing";

/** What the table shows, or undefined with `table: false`. Reads every cell, so a column that throws throws here. */
export function tableModel<D>(input: TableInput<D>): TableModel | undefined {
  const { option, format } = input;
  if (option === false) return undefined;
  const options: TableOptions<D> = typeof option === "object" ? option : {};
  const columns = options.columns ?? [];
  const first = columns.filter((column) => column.after !== "values");
  const last = columns.filter((column) => column.after === "values");
  const totals = input.total ?? input.series.length > 1;
  const number = (value: number): TableCell => ({ text: format(value), numeric: true });
  const grand = input.rows.reduce((sum, row) => sum + row.total, 0);
  const share = (value: number): TableCell[] => (input.shares ? [{ text: percent(grand > 0 ? value / grand : 0), numeric: true }] : []);
  const header = (column: TableColumn<D>): TableCell => ({ text: column.label, numeric: false });
  // Only the option's own keys count, so "constructor" is just a series.
  const own = (series: string): string | undefined => (options.series && Object.prototype.hasOwnProperty.call(options.series, series) ? options.series[series] : undefined);
  const blank = (): TableCell => ({ text: "", numeric: false });
  const missing: TableCell = { text: input.missing ?? MISSING, numeric: true };

  const headers: TableCell[] = [
    { text: options.category ?? input.category ?? "Category", numeric: false },
    ...first.map(header),
    ...input.series.map((series) => ({ text: own(series) ?? input.label?.(series) ?? series, numeric: true })),
    ...(totals ? [{ text: options.total ?? "Total", numeric: true }] : []),
    ...(input.shares ? [{ text: options.share ?? "Share", numeric: true }] : []),
    ...last.map(header)
  ];
  const rows = input.rows.map((row) => {
    const values = new Map(row.values.map((v) => [v.series, v.value]));
    return {
      key: row.key,
      cells: [
        { text: row.category, numeric: false },
        ...first.map((column) => columnCell(column, row, format)),
        ...input.series.map((series) => (row.missing?.has(series) ? missing : number(values.get(series) ?? 0))),
        ...(totals ? [number(row.total)] : []),
        ...share(row.total),
        ...last.map((column) => columnCell(column, row, format))
      ]
    };
  });
  const sum = (series: string): number => input.rows.reduce((total, row) => total + (row.values.find((v) => v.series === series)?.value ?? 0), 0);
  const footer: TableCell[] | undefined = input.shares
    ? [
        { text: options.total ?? "Total", numeric: false },
        ...first.map(blank),
        ...input.series.map((series) => number(sum(series))),
        ...(totals ? [number(grand)] : []),
        ...share(grand),
        ...last.map(blank)
      ]
    : undefined;
  // A column of numbers is right-aligned, header and all.
  const lastAt = headers.length - last.length;
  const pageColumns = [...first.map((_, i) => 1 + i), ...last.map((_, i) => lastAt + i)];
  for (const at of pageColumns) {
    const cells = rows.map((row) => row.cells[at]!).filter((cell) => cell.text !== "");
    if (cells.length > 0 && cells.every((cell) => cell.numeric)) headers[at] = { ...headers[at]!, numeric: true };
  }
  return {
    hidden: option === "hidden" || options.hidden === true,
    summary: options.summary ?? "Data table",
    caption: input.caption,
    headers,
    rows,
    ...(footer ? { footer } : {})
  };
}

function columnCell<D>(column: TableColumn<D>, row: TableRow<D>, format: (value: number) => string): TableCell {
  const value = typeof column.field === "function" ? column.field(row.datum, row.index) : (row.datum as Record<string, unknown> | null | undefined)?.[column.field];
  if (column.format) return { text: String(column.format(value)), numeric: typeof value === "number" };
  if (value === null || value === undefined) return { text: "", numeric: false };
  if (typeof value === "number") return { text: format(value), numeric: true };
  return { text: String(value), numeric: false };
}

/** The data table for a chart's <svg>: made the first time there's something to show, just after the <svg>. */
export function chartTable(svg: SVGSVGElement): ChartTable {
  const doc = svg.ownerDocument;
  /** The <details>, or the visually hidden <div>, around the table. */
  let wrapper: HTMLElement | undefined;
  let summary: HTMLElement | undefined;
  let table: HTMLTableElement | undefined;
  let caption: HTMLTableCaptionElement | undefined;
  let head: HTMLTableRowElement | undefined;
  let body: HTMLTableSectionElement | undefined;
  /** The total row's <tfoot>, while the model has one. */
  let foot: HTMLTableSectionElement | undefined;
  /** The body's rows by key. */
  const rows = new Map<string, HTMLTableRowElement>();
  /** The headers drawn, so a change of columns redraws the rows. */
  let drawn = "";

  const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] => {
    const made = doc.createElement(tag);
    if (className) made.className = className;
    return made;
  };

  function build(): HTMLTableElement {
    table = element("table");
    caption = element("caption", "ec-table-caption");
    const thead = element("thead");
    head = element("tr");
    thead.appendChild(head);
    body = element("tbody");
    table.append(caption, thead, body);
    return table;
  }

  /** The wrapper for `hidden`, made or swapped in place, holding the table. */
  function place(hidden: boolean, text: string): void {
    const want = hidden ? "DIV" : "DETAILS";
    if (wrapper?.tagName !== want) {
      const next = hidden ? element("div", "ec-table ec-visually-hidden") : element("details", "ec-table");
      const content = table ?? build();
      if (hidden) {
        summary = undefined;
        next.appendChild(content);
      } else {
        summary = element("summary");
        const scroll = element("div", "ec-table-scroll");
        scroll.appendChild(content);
        next.append(summary, scroll);
      }
      if (wrapper?.isConnected) wrapper.replaceWith(next);
      wrapper = next;
    }
    if (!wrapper.isConnected) svg.after(wrapper);
    if (summary && summary.textContent !== text) summary.textContent = text;
  }

  function fill(cell: HTMLTableCellElement, { text, numeric }: TableCell): void {
    if (cell.textContent !== text) cell.textContent = text;
    cell.classList.toggle("ec-num", numeric);
  }

  function remove(): void {
    wrapper?.remove();
    wrapper = summary = table = caption = head = body = foot = undefined;
    rows.clear();
    drawn = "";
  }

  return {
    render(model) {
      if (!model) {
        remove();
        return;
      }
      place(model.hidden, model.summary);
      if (caption!.textContent !== model.caption) caption!.textContent = model.caption;

      const headers = JSON.stringify(model.headers);
      if (headers !== drawn) {
        drawn = headers;
        head!.replaceChildren(
          ...model.headers.map((header) => {
            const th = element("th");
            th.scope = "col";
            fill(th, header);
            return th;
          })
        );
        // Other columns: every row is drawn again.
        rows.clear();
        body!.replaceChildren();
      }

      const keep = new Set(model.rows.map((row) => row.key));
      for (const [key, tr] of rows) {
        if (keep.has(key)) continue;
        tr.remove();
        rows.delete(key);
      }
      model.rows.forEach((row, i) => {
        let tr = rows.get(row.key);
        if (!tr) {
          tr = element("tr");
          tr.setAttribute("data-key", row.key);
          row.cells.forEach((_, j) => {
            const cell = element(j === 0 ? "th" : "td");
            if (j === 0) (cell as HTMLTableCellElement).scope = "row";
            tr!.appendChild(cell);
          });
          rows.set(row.key, tr);
        }
        row.cells.forEach((cell, j) => fill(tr!.cells[j]!, cell));
        // In visual order, moving only rows that are out of place.
        if (body!.children[i] !== tr) body!.insertBefore(tr, body!.children[i] ?? null);
      });

      if (!model.footer) {
        foot?.remove();
        foot = undefined;
        return;
      }
      const cells = model.footer;
      let total = foot?.rows[0];
      if (!foot || !total || total.cells.length !== cells.length) {
        foot?.remove();
        foot = element("tfoot");
        total = element("tr");
        cells.forEach((_, j) => {
          const cell = element(j === 0 ? "th" : "td");
          if (j === 0) (cell as HTMLTableCellElement).scope = "row";
          total!.appendChild(cell);
        });
        foot.appendChild(total);
        table!.appendChild(foot);
      }
      cells.forEach((cell, j) => fill(total!.cells[j]!, cell));
    },
    destroy: remove
  };
}
