"use client";

import Link from "next/link";
import { useLive } from "@/components/live";
import { Badge, Card, StatusBadge, TimeText, statusColor } from "@/components/ui";
import { SUBSYSTEMS, subsystemColor } from "@/lib/subsystems";
import { fmtAgo, fmtFull } from "@/lib/format";

interface Overview {
  windowHours: number;
  funnel: { events: number; notifications: number; signals: number; positions: number };
  outbox: {
    events: Record<string, number>;
    notifications: Record<string, number>;
    signals: Record<string, number>;
  };
  pipeline: { notifications: Record<string, number> };
  signalStatus: Record<string, number>;
  heartbeats: { service: string; last: string | null; state: string }[];
  stuck: { notifications: number; expiredOpenSignals: number };
  recentErrors: {
    id: string;
    ts: string;
    level: string;
    service: string;
    event: string;
    symbol: string | null;
    fields: unknown;
  }[];
}

/** Funnel steps, each tagged with the subsystem that produces it. */
const FUNNEL: { key: keyof Overview["funnel"]; label: string; subsystem: string }[] = [
  { key: "events", label: "Events", subsystem: "ingestion" },
  { key: "notifications", label: "Notifications", subsystem: "ingestion" },
  { key: "signals", label: "Signals", subsystem: "analysis" },
  { key: "positions", label: "Positions", subsystem: "portfolio" },
];

function StatusCounts({ map }: { map: Record<string, number> }) {
  const keys = Object.keys(map);
  if (keys.length === 0) return <span style={{ color: "var(--muted)" }}>—</span>;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {keys.map((k) => (
        <Badge key={k} color={statusColor(k)}>
          {k} {map[k]}
        </Badge>
      ))}
    </div>
  );
}

export default function OverviewPage() {
  const { data, error } = useLive<Overview>("/api/overview?windowHours=24");

  if (error) return <ErrorBox error={error} />;
  if (!data) return <p style={{ color: "var(--muted)" }}>Loading…</p>;

  const beatOf = (svc: string) => data.heartbeats.find((h) => h.service === svc);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
        Pipeline overview{" "}
        <span style={{ color: "var(--muted)", fontSize: 13, fontWeight: 400 }}>· last 24h · live</span>
      </h1>

      {/* Funnel — coloured by the subsystem that produces each step */}
      <Card title="Pipeline funnel (24h)">
        <div style={{ display: "flex", alignItems: "stretch", gap: 8, flexWrap: "wrap" }}>
          {FUNNEL.map((f, i) => (
            <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ textAlign: "center", minWidth: 110 }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: subsystemColor(f.subsystem) }}>
                  {data.funnel[f.key]}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{f.label}</div>
              </div>
              {i < FUNNEL.length - 1 && <span style={{ color: "var(--muted)", fontSize: 18 }}>→</span>}
            </div>
          ))}
        </div>
      </Card>

      {/* Three subsystem swimlanes: ingestion → analysis → portfolio */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>
        {SUBSYSTEMS.map((s) => {
          const beat = beatOf(s.name);
          return (
            <Card
              key={s.name}
              accent={s.color}
              title={
                <Link href={`/system/${s.name}`} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 999, background: statusColor(beat?.state ?? "unknown") }} />
                  <span style={{ color: s.color, fontWeight: 700 }}>{s.label}</span>
                  <span style={{ color: "var(--muted)", fontWeight: 400 }}>:{s.port}</span>
                  <StatusBadge status={beat?.state ?? "unknown"} />
                  <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)" }} title={fmtFull(beat?.last)}>
                    {fmtAgo(beat?.last)}
                  </span>
                </Link>
              }
            >
              {s.name === "ingestion" && (
                <>
                  <Row label="events → analysis">
                    <StatusCounts map={data.outbox.events} />
                  </Row>
                  <Row label="notifications → analysis">
                    <StatusCounts map={data.outbox.notifications} />
                  </Row>
                  <Row label="notifications stuck >5m">
                    <b style={{ color: data.stuck.notifications ? "#d29922" : undefined }}>{data.stuck.notifications}</b>
                  </Row>
                </>
              )}
              {s.name === "analysis" && (
                <>
                  <Row label="signals → portfolio">
                    <StatusCounts map={data.outbox.signals} />
                  </Row>
                  <Row label="signal lifecycle">
                    <StatusCounts map={data.signalStatus} />
                  </Row>
                  <Row label="notification pipeline">
                    <StatusCounts map={data.pipeline.notifications} />
                  </Row>
                </>
              )}
              {s.name === "portfolio" && (
                <>
                  <Row label="positions opened (24h)">
                    <b>{data.funnel.positions}</b>
                  </Row>
                  <Row label="open signals past expiry">
                    <b style={{ color: data.stuck.expiredOpenSignals ? "#d29922" : undefined }}>
                      {data.stuck.expiredOpenSignals}
                    </b>
                  </Row>
                </>
              )}
            </Card>
          );
        })}
      </div>

      {/* Recent errors */}
      <Card title="Recent errors & warnings">
        {data.recentErrors.length === 0 ? (
          <span style={{ color: "var(--muted)" }}>None 🎉</span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {data.recentErrors.map((e) => (
              <div key={e.id} style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 13 }}>
                <span style={{ color: "var(--muted)", minWidth: 120 }}><TimeText ts={e.ts} /></span>
                <StatusBadge status={e.level} />
                <span style={{ color: subsystemColor(e.service) }}>[{e.service}]</span>
                <span style={{ fontWeight: 600 }}>{e.event}</span>
                {e.symbol && <Link href={`/symbol/${e.symbol}`}><Badge>{e.symbol}</Badge></Link>}
                <span style={{ color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {JSON.stringify(e.fields)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "4px 0" }}>
      <span style={{ color: "var(--muted)", fontSize: 13 }}>{label}</span>
      <span>{children}</span>
    </div>
  );
}

function ErrorBox({ error }: { error: { message?: string } }) {
  return (
    <div style={{ color: "#f85149", padding: 16, border: "1px solid #f8514940", borderRadius: 10 }}>
      Error: {String(error?.message ?? error)}
      <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 6 }}>
        Check that DATABASE_URL is set and the migration has been applied.
      </div>
    </div>
  );
}
