// The chart's data table: the fallback that every screen reader can read, whatever it makes of ARIA
// in SVG. A closed <details> "Data table" after the chart, or, with `table: "hidden"`, a table that's
// visually hidden but still read. Its rows are the chart's, in visual order, so it follows the sort;
// its columns are the category (each row's header), any extra columns the page lists, each series,
// and the total of a stack, in the chart's format. Text is only ever set as text, never parsed as HTML.

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
  /** A series' column header: its label. Default: the series' own name. */
  readonly label?: (series: string) => string;
  /** In visual order. */
  readonly rows: readonly TableRow<D>[];
  readonly format: (value: number) => string;
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
  const { hidden, columns, category, total, summary } = option as TableOptions<unknown>;
  if (hidden !== undefined && typeof hidden !== "boolean") fail("table.hidden must be true or false.");
  for (const [name, text] of Object.entries({ category, total, summary })) {
    if (text !== undefined && typeof text !== "string") fail(`table.${name} must be a string.`);
  }
  if (columns === undefined) return;
  if (!Array.isArray(columns)) fail("table.columns must be an array of { label, field }.");
  columns.forEach((entry: Partial<TableColumn<unknown>> | null, i: number) => {
    const column = typeof entry === "object" && entry !== null ? entry : fail(`table.columns[${i}] must be an object with a label and a field.`);
    if (typeof column.label !== "string") fail(`table.columns[${i}].label must be a string: the column's header.`);
    if (typeof column.field !== "string" && typeof column.field !== "function") fail(`table.columns[${i}].field must be a field name or a function of the row.`);
    if (column.format !== undefined && typeof column.format !== "function") fail(`table.columns[${i}].format must be a function.`);
  });
}

/** What the table shows, or undefined with `table: false`. Reads every cell, so a column that throws throws here. */
export function tableModel<D>(input: TableInput<D>): TableModel | undefined {
  const { option, format } = input;
  if (option === false) return undefined;
  const options: TableOptions<D> = typeof option === "object" ? option : {};
  const columns = options.columns ?? [];
  const stacked = input.series.length > 1;
  const number = (value: number): TableCell => ({ text: format(value), numeric: true });

  const headers: TableCell[] = [
    { text: options.category ?? input.category ?? "Category", numeric: false },
    ...columns.map((column) => ({ text: column.label, numeric: false })),
    ...input.series.map((series) => ({ text: input.label?.(series) ?? series, numeric: true })),
    ...(stacked ? [{ text: options.total ?? "Total", numeric: true }] : [])
  ];
  const rows = input.rows.map((row) => {
    const values = new Map(row.values.map((v) => [v.series, v.value]));
    return {
      key: row.key,
      cells: [
        { text: row.category, numeric: false },
        ...columns.map((column) => columnCell(column, row, format)),
        ...input.series.map((series) => number(values.get(series) ?? 0)),
        ...(stacked ? [number(row.total)] : [])
      ]
    };
  });
  // A column of numbers is right-aligned, header and all.
  columns.forEach((_, i) => {
    const cells = rows.map((row) => row.cells[1 + i]!).filter((cell) => cell.text !== "");
    if (cells.length > 0 && cells.every((cell) => cell.numeric)) headers[1 + i] = { ...headers[1 + i]!, numeric: true };
  });
  return {
    hidden: option === "hidden" || options.hidden === true,
    summary: options.summary ?? "Data table",
    caption: input.caption,
    headers,
    rows
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
    wrapper = summary = table = caption = head = body = undefined;
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
    },
    destroy: remove
  };
}
