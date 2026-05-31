"use client";

import { useParams } from "next/navigation";
import { useLive } from "@/components/live";
import { Badge, Card, Grid, JsonView, Stat, StatusBadge, statusColor } from "@/components/ui";
import { fmtMoney, fmtPct, fmtFull } from "@/lib/format";

interface Trace {
  symbol: string;
  events: { id: string; eventType: string | null; headline: string | null; status: string; deliveryStatus: string; ingestedAt: string }[];
  notifications: { id: string; eventType: string; summary: string | null; count: number; status: string; deliveryStatus: string; ingestedAt: string }[];
  signals: {
    id: string;
    direction: string;
    conviction: string | null;
    targetPrice: number | null;
    deviationPct: number | null;
    status: string;
    thesis: string | null;
    createdAt: string;
    outcomes: { horizon: string; returnPct: number | null; alphaPct: number | null }[];
  }[];
  valuations: { snapshotId: string; fairValuePerShare: number | null; currentPrice: number | null; upsidePct: number | null; verdict: string | null; createdAt: string }[];
  feedback: { id: string; lesson: string; createdAt: string }[];
  logs: { id: string; ts: string; level: string; service: string; event: string; fields: Record<string, unknown> | null }[];
}

type Entry = { ts: string; kind: string; color: string; node: React.ReactNode };

export default function SymbolPage() {
  const params = useParams<{ symbol: string }>();
  const symbol = (params.symbol ?? "").toUpperCase();
  const { data, error } = useLive<Trace>(`/api/symbol/${symbol}`);

  if (error) return <div style={{ color: "#f85149" }}>Error: {String(error.message ?? error)}</div>;
  if (!data) return <p style={{ color: "var(--muted)" }}>Loading…</p>;

  const entries: Entry[] = [];
  for (const e of data.events)
    entries.push({
      ts: e.ingestedAt,
      kind: "event",
      color: "#58a6ff",
      node: (
        <>
          <Badge color="#58a6ff">event</Badge> {e.eventType && <Badge>{e.eventType}</Badge>}{" "}
          <span>{e.headline ?? e.id}</span> <StatusBadge status={e.status} /> <StatusBadge status={e.deliveryStatus} />
        </>
      ),
    });
  for (const n of data.notifications)
    entries.push({
      ts: n.ingestedAt,
      kind: "notification",
      color: "#a371f7",
      node: (
        <>
          <Badge color="#a371f7">notification</Badge> <Badge>{n.eventType}</Badge>{" "}
          <span>{n.summary ?? `${n.count} events`}</span> <StatusBadge status={n.status} /> <StatusBadge status={n.deliveryStatus} />
        </>
      ),
    });
  for (const s of data.signals)
    entries.push({
      ts: s.createdAt,
      kind: "signal",
      color: "#3fb950",
      node: (
        <>
          <Badge color="#3fb950">signal</Badge>{" "}
          <Badge color={s.direction === "buy" ? "#3fb950" : s.direction === "sell" ? "#f85149" : "#9aa7bd"}>{s.direction}</Badge>{" "}
          {s.conviction && <Badge>{s.conviction}</Badge>} target {fmtMoney(s.targetPrice)} · dev {fmtPct(s.deviationPct)}{" "}
          <StatusBadge status={s.status} />
          {s.outcomes.length > 0 && (
            <span style={{ color: "var(--muted)" }}>
              {" "}
              · {s.outcomes.map((o) => `${o.horizon} ${fmtPct(o.returnPct)}`).join(" / ")}
            </span>
          )}
        </>
      ),
    });
  for (const v of data.valuations)
    entries.push({
      ts: v.createdAt,
      kind: "valuation",
      color: "#d29922",
      node: (
        <>
          <Badge color="#d29922">valuation</Badge> fair {fmtMoney(v.fairValuePerShare)} vs {fmtMoney(v.currentPrice)} · upside{" "}
          {fmtPct(v.upsidePct)} <StatusBadge status={v.verdict} />
        </>
      ),
    });
  for (const fb of data.feedback)
    entries.push({
      ts: fb.createdAt,
      kind: "feedback",
      color: "#8a97ab",
      node: (
        <>
          <Badge>feedback</Badge> {fb.lesson}
        </>
      ),
    });
  for (const l of data.logs)
    entries.push({
      ts: l.ts,
      kind: "log",
      color: statusColor(l.level),
      node: (
        <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12.5 }}>
          <StatusBadge status={l.level} /> <span style={{ color: "var(--muted)" }}>[{l.service}]</span>{" "}
          <b>{l.event}</b>{" "}
          <span style={{ color: "var(--muted)" }}>{l.fields ? JSON.stringify(l.fields) : ""}</span>
        </span>
      ),
    });

  entries.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  const latestVal = data.valuations[0];
  const openSignals = data.signals.filter((s) => s.status === "open").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{symbol}</h1>

      <Grid min={170}>
        <Stat label="events" value={data.events.length} />
        <Stat label="notifications" value={data.notifications.length} />
        <Stat label="signals" value={data.signals.length} sub={`${openSignals} open`} />
        <Stat label="feedback" value={data.feedback.length} />
        <Stat
          label="latest valuation"
          value={latestVal ? <StatusBadge status={latestVal.verdict} /> : "—"}
          sub={latestVal ? `upside ${fmtPct(latestVal.upsidePct)}` : undefined}
        />
      </Grid>

      <Card title={`Unified timeline (${entries.length})`}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {entries.length === 0 && <span style={{ color: "var(--muted)" }}>No activity for {symbol}.</span>}
          {entries.map((e, i) => (
            <div
              key={`${e.kind}-${i}`}
              style={{ display: "flex", gap: 12, alignItems: "baseline", padding: "6px 0", borderLeft: `2px solid ${e.color}`, paddingLeft: 12, marginLeft: 4 }}
            >
              <span style={{ color: "var(--muted)", whiteSpace: "nowrap", fontSize: 12, minWidth: 210 }}>{fmtFull(e.ts)}</span>
              <span style={{ fontSize: 13 }}>{e.node}</span>
            </div>
          ))}
        </div>
      </Card>

      <details>
        <summary style={{ cursor: "pointer", color: "var(--muted)" }}>Raw trace JSON</summary>
        <JsonView value={data} />
      </details>
    </div>
  );
}
