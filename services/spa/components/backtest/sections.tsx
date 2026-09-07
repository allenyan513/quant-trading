/**
 * Result sections shared by the free-form tool and the comparison pages.
 *
 * These were duplicated near-verbatim across `results.tsx` and `comparison.tsx`
 * after the two were split — the cuts panel character-for-character, the warnings
 * list, and the error/loading three-way. One copy each, so a fix lands in both.
 */
import type { ReactNode } from "react";
import { money, fmtPct } from "@/lib/format";
import { panel, table, h2Style, subStyle, Th, Td } from "@/components/tool-ui";
import type { DividendCut } from "@qt/shared/backtest";

export function WarningList({ warnings }: { warnings: readonly string[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--warn)" }}>
      {warnings.map((w) => (
        <li key={w}>{w}</li>
      ))}
    </ul>
  );
}

/**
 * Dividend cuts. `alwaysShow` is the emphasis switch: a dividend-led page states
 * "nobody cut" because that is a finding, while a growth page with no cuts just
 * omits the section rather than answering a question nobody asked.
 */
export function CutsPanel({
  cuts,
  emptyText,
  alwaysShow,
}: {
  cuts: readonly DividendCut[];
  emptyText: string;
  alwaysShow: boolean;
}) {
  if (cuts.length === 0 && !alwaysShow) return null;
  return (
    <div style={panel}>
      <h2 style={h2Style}>Dividend cuts in this window</h2>
      {cuts.length === 0 ? (
        <p style={subStyle}>{emptyText}</p>
      ) : (
        <ScrollTable>
          <thead>
            <tr>
              <Th>Symbol</Th>
              <Th>Year</Th>
              <Th align="right">Paid / share</Th>
              <Th align="right">Prior year</Th>
              <Th align="right">Change</Th>
            </tr>
          </thead>
          <tbody>
            {cuts.map((c) => (
              <tr key={`${c.symbol}-${c.year}`}>
                <Td>{c.symbol}</Td>
                <Td>{c.year}</Td>
                <Td align="right">{money(c.perShare, "headline")}</Td>
                <Td align="right">{money(c.priorPerShare, "headline")}</Td>
                <Td align="right" color="var(--down)">
                  {fmtPct(c.changePct)}
                </Td>
              </tr>
            ))}
          </tbody>
        </ScrollTable>
      )}
    </div>
  );
}

/** Wide content scrolls inside its own box — the page must never scroll sideways. */
export function ScrollTable({ children }: { children: ReactNode }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={table}>{children}</table>
    </div>
  );
}

/**
 * What a low-dividend holding gets instead of eleven rows of small change: one
 * true sentence. Dropping the number entirely would be throwing away a real
 * figure — reinvesting still added 4.2% of QQQ's ending value over ten years.
 */
export function IncomeSummaryLine({ income, sharePct, dripEdge }: { income: number; sharePct: number; dripEdge: number }) {
  return (
    <div style={panel}>
      <h2 style={h2Style}>Dividends</h2>
      <p style={{ ...subStyle, margin: 0 }}>
        Dividends paid {money(income, "headline")} over the window — {sharePct.toFixed(1)}% of the total gain. Reinvesting them was
        worth {money(dripEdge, "headline")} by the end.
      </p>
    </div>
  );
}

/** error → loading → nothing. Returns null when there is simply no result yet, so
 *  a page that has not run anything shows nothing rather than a stuck spinner. */
export function ResultsGate({
  error,
  loading,
  hasResult,
  children,
}: {
  error: string | null;
  loading: boolean;
  hasResult: boolean;
  children: ReactNode;
}) {
  if (error) {
    // String(): a non-string reaching this panel used to blank the whole page.
    return <div style={{ ...panel, borderColor: "var(--down)", color: "var(--down)", fontSize: 14 }}>{String(error)}</div>;
  }
  if (loading) return <div style={{ ...panel, color: "var(--muted)", fontSize: 14 }}>Running the backtest…</div>;
  if (!hasResult) return null;
  return <>{children}</>;
}
