"use client";

/**
 * Overall tab — the company profile (moomoo-style): a key/value grid of identity
 * facts (CEO, sector, employees, exchange, ISIN, IPO date, market cap, website…)
 * plus the full business description. Sourced from data_company_profile (warmed
 * from FMP); "Refresh data" in the right panel pulls it for a cold symbol.
 */

import { useParams } from "next/navigation";
import { useLive } from "@/components/live";
import { formatLargeNumber } from "@/lib/format";

interface ProfileResp {
  profile: Record<string, unknown>;
  knownAt: string;
}

/** string|number → trimmed display string, else null (FMP mixes both, e.g. employees). */
const txt = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : null;
const numv = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export default function OverallTab() {
  const params = useParams<{ symbol: string }>();
  const symbol = (params.symbol ?? "").toUpperCase();
  const { data, error } = useLive<ProfileResp | null>(`/api/data/symbol/${symbol}/profile`);

  if (error) return <div style={{ color: "#f85149" }}>Error: {String(error.message ?? error)}</div>;
  if (data === undefined) return <p style={{ color: "var(--muted)" }}>Loading…</p>;
  const p = data?.profile ?? null;
  if (!p) return <p style={{ color: "var(--muted)" }}>No company profile yet — use “⟳ Refresh data” to pull it from FMP.</p>;

  const website = txt(p.website);
  const mktCap = numv(p.mktCap);
  const beta = numv(p.beta);
  const entries: Array<[string, React.ReactNode]> = [
    ["Company name", txt(p.companyName)],
    ["CEO", txt(p.ceo)],
    ["Sector", txt(p.sector)],
    ["Industry", txt(p.industry)],
    ["Employees", numv(p.fullTimeEmployees) != null ? Number(p.fullTimeEmployees).toLocaleString() : txt(p.fullTimeEmployees)],
    ["Exchange", txt(p.exchangeShortName) ?? txt(p.exchange)],
    ["Market cap", mktCap != null ? formatLargeNumber(mktCap) : null],
    ["Beta", beta != null ? beta.toFixed(2) : null],
    ["IPO date", txt(p.ipoDate)],
    ["Currency", txt(p.currency)],
    ["ISIN", txt(p.isin)],
    ["CUSIP", txt(p.cusip)],
    ["CIK", txt(p.cik)],
    ["Country", txt(p.country)],
    ["Phone", txt(p.phone)],
    ["Website", website ? <a href={website} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>{website}</a> : null],
  ];
  const fields = entries.filter(([, v]) => v != null && v !== "");

  const addr = [txt(p.address), txt(p.city), txt(p.state), txt(p.zip)].filter(Boolean).join(", ");
  const desc = txt(p.description);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={grid}>
        {fields.map(([label, value]) => (
          <div key={label} style={row}>
            <span style={lbl}>{label}</span>
            <span style={val}>{value}</span>
          </div>
        ))}
        {addr && (
          <div style={{ ...row, gridColumn: "1 / -1" }}>
            <span style={lbl}>Address</span>
            <span style={{ ...val, whiteSpace: "normal" }}>{addr}</span>
          </div>
        )}
      </div>

      {desc && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Description</div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7 }}>{desc}</p>
        </div>
      )}
    </div>
  );
}

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "0 28px",
  border: "1px solid var(--border)",
  padding: "4px 14px",
};
const row: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: "8px 0",
  borderBottom: "1px solid var(--border)",
  fontSize: 13,
};
const lbl: React.CSSProperties = { color: "var(--muted)", fontWeight: 600, whiteSpace: "nowrap" };
const val: React.CSSProperties = { textAlign: "right", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
