"use client";

import useSWR from "swr";
import { Fragment, useState, type ReactNode } from "react";

async function fetcher(url: string) {
  const res = await fetch(url);
  if (res.status === 401) {
    window.location.href = "/sign-in";
    throw new Error("unauthorized");
  }
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? "request failed");
  return json.data;
}

const REFRESH_MS = 5000;

/** SWR hook with 5s polling and the dashboard's envelope unwrapping. */
export function useLive<T = unknown>(url: string) {
  return useSWR<T>(url, fetcher, { refreshInterval: REFRESH_MS, keepPreviousData: true });
}

export interface Column<Row> {
  key: string;
  header: string;
  render?: (row: Row) => ReactNode;
  width?: number | string;
  /** Optional sort accessor — when present the header becomes clickable (client-side sort). */
  sort?: (row: Row) => string | number | boolean | null | undefined;
}

export interface Filter {
  key: string;
  label: string;
  options?: { value: string; label: string }[]; // present => select, else text input
}

interface LiveTableProps<Row> {
  path: string;
  columns: Column<Row>[];
  filters?: Filter[];
  rowKey: (row: Row) => string;
  expand?: (row: Row) => ReactNode;
  emptyText?: string;
  /** Opt-in pagination: when set, append limit/offset and show Prev/Next. */
  pageSize?: number;
  /** Double-click a row (e.g. to open the symbol detail page). */
  onRowDoubleClick?: (row: Row) => void;
  /** Client-side row filter applied to the fetched data (e.g. by active group tab). */
  rowFilter?: (row: Row) => boolean;
  /** When set, rows are draggable; the returned string is put on dataTransfer "symbol". */
  getRowDragData?: (row: Row) => string;
}

export function LiveTable<Row>({ path, columns, filters = [], rowKey, expand, emptyText, pageSize, onRowDoubleClick, rowFilter, getRowDragData }: LiveTableProps<Row>) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);

  // Changing a filter resets to the first page.
  function setFilter(key: string, val: string) {
    setValues((v) => ({ ...v, [key]: val }));
    setOffset(0);
  }

  // Click a sortable header: asc → desc → off (back to the API's default order).
  function cycleSort(key: string) {
    setSort((s) => (!s || s.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null));
  }

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(values)) if (v) qs.set(k, v);
  if (pageSize) {
    // Fetch one extra row as a probe: if it comes back there IS a next page —
    // an accurate hasMore without a separate count query.
    qs.set("limit", String(pageSize + 1));
    qs.set("offset", String(offset));
  }
  const url = qs.toString() ? `${path}?${qs}` : path;

  const { data, error, isLoading } = useLive<Row[]>(url);
  const fetched = data ?? [];
  const filtered = rowFilter ? fetched.filter(rowFilter) : fetched;
  const ordered = sort ? sortRows(filtered, columns, sort) : filtered;
  const hasMore = pageSize ? ordered.length > pageSize : false;
  const rows = pageSize ? ordered.slice(0, pageSize) : ordered;

  return (
    <div>
      {filters.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {filters.map((f) =>
            f.options ? (
              <select
                key={f.key}
                value={values[f.key] ?? ""}
                onChange={(e) => setFilter(f.key, e.target.value)}
                style={inputStyle}
              >
                <option value="">{f.label}: all</option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                key={f.key}
                placeholder={f.label}
                value={values[f.key] ?? ""}
                onChange={(e) => setFilter(f.key, e.target.value)}
                style={inputStyle}
              />
            ),
          )}
          <span style={{ alignSelf: "center", fontSize: 12, color: "var(--muted)" }}>
            {isLoading ? "loading…" : `${rows.length} rows · live 5s`}
          </span>
        </div>
      )}

      {error && <div style={{ color: "#f85149", marginBottom: 8 }}>Error: {String(error.message ?? error)}</div>}

      <div style={{ overflowX: "auto", border: "1px solid var(--border)" }}>
        <table>
          <thead>
            <tr>
              {expand && <th style={thStyle} />}
              {columns.map((c) => {
                const sortable = !!c.sort;
                const dir = sort?.key === c.key ? sort.dir : null;
                return (
                  <th
                    key={c.key}
                    onClick={sortable ? () => cycleSort(c.key) : undefined}
                    style={{ ...thStyle, width: c.width, cursor: sortable ? "pointer" : "default", userSelect: "none" }}
                  >
                    {c.header}
                    {sortable && (
                      <span style={{ marginLeft: 4, fontSize: 10, color: dir ? "var(--accent)" : "var(--border)" }}>
                        {dir === "asc" ? "▲" : dir === "desc" ? "▼" : "↕"}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + (expand ? 1 : 0)} style={{ ...tdStyle, color: "var(--muted)" }}>
                  {emptyText ?? "No rows."}
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const k = rowKey(row);
              const isOpen = open === k;
              return (
                <Fragment key={k}>
                  <tr
                    draggable={!!getRowDragData}
                    onDragStart={
                      getRowDragData
                        ? (e) => {
                            e.dataTransfer.setData("symbol", getRowDragData(row));
                            e.dataTransfer.effectAllowed = "move";
                          }
                        : undefined
                    }
                    onClick={expand ? () => setOpen(isOpen ? null : k) : undefined}
                    onDoubleClick={onRowDoubleClick ? () => onRowDoubleClick(row) : undefined}
                    style={{ cursor: expand || onRowDoubleClick ? "pointer" : "default", background: isOpen ? "var(--panel-2)" : undefined }}
                  >
                    {expand && <td style={{ ...tdStyle, color: "var(--muted)" }}>{isOpen ? "▾" : "▸"}</td>}
                    {columns.map((c) => (
                      <td key={c.key} style={tdStyle}>
                        {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? "—")}
                      </td>
                    ))}
                  </tr>
                  {expand && isOpen && (
                    <tr>
                      <td colSpan={columns.length + 1} style={{ ...tdStyle, background: "var(--panel-2)" }}>
                        {expand(row)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {pageSize && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
          <button disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - pageSize))} style={pageBtn(offset === 0)}>
            ‹ Prev
          </button>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            {rows.length === 0 ? "0" : `${offset + 1}–${offset + rows.length}`}
          </span>
          <button disabled={!hasMore} onClick={() => setOffset((o) => o + pageSize)} style={pageBtn(!hasMore)}>
            Next ›
          </button>
        </div>
      )}
    </div>
  );
}

/** Client-side sort by a column's `sort` accessor; nullish values always sink to the bottom. */
function sortRows<Row>(rows: Row[], columns: Column<Row>[], sort: { key: string; dir: "asc" | "desc" }): Row[] {
  const accessor = columns.find((c) => c.key === sort.key)?.sort;
  if (!accessor) return rows;
  const dir = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = accessor(a);
    const vb = accessor(b);
    const an = va == null || va === "";
    const bn = vb == null || vb === "";
    if (an && bn) return 0;
    if (an) return 1; // nulls last
    if (bn) return -1;
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    return String(va).localeCompare(String(vb)) * dir;
  });
}

const pageBtn = (disabled: boolean): React.CSSProperties => ({
  background: "var(--panel-2)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  borderRadius: 8,
  padding: "5px 12px",
  fontSize: 13,
  cursor: disabled ? "default" : "pointer",
  opacity: disabled ? 0.4 : 1,
});

const inputStyle: React.CSSProperties = {
  background: "var(--panel-2)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  borderRadius: 8,
  padding: "5px 9px",
  fontSize: 13,
  minWidth: 130,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 10px",
  fontSize: 12,
  color: "var(--muted)",
  borderBottom: "1px solid var(--border)",
  borderRight: "1px solid var(--border)", // vertical gridline (IBKR-style)
  position: "sticky",
  top: 0,
  background: "var(--panel)",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "5px 10px",
  borderBottom: "1px solid var(--border)",
  borderRight: "1px solid var(--border)", // vertical gridline (IBKR-style)
  verticalAlign: "top",
  fontSize: 13,
  fontVariantNumeric: "tabular-nums",
};
