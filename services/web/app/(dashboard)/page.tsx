"use client";

import Link from "next/link";
import { useLive } from "@/components/live";
import { Badge, Card, Grid, Stat, StatusBadge, TimeText, statusColor } from "@/components/ui";
import { fmtAgo, fmtFull } from "@/lib/format";

interface Overview {
  windowHours: number;
  funnel: { events: number; notifications: number; signals: number; outcomes: number; feedback: number };
  outbox: {
    events: Record<string, number>;
    notifications: Record<string, number>;
    signals: Record<string, number>;
  };
  pipeline: { events: Record<string, number>; notifications: Record<string, number> };
  signalStatus: Record<string, number>;
  heartbeats: { service: string; last: string | null; state: string }[];
  stuck: { notifications: number; events: number; expiredOpenSignals: number };
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

const FUNNEL: { key: keyof Overview["funnel"]; label: string }[] = [
  { key: "events", label: "Events" },
  { key: "notifications", label: "Notifications" },
  { key: "signals", label: "Signals" },
  { key: "outcomes", label: "Outcomes" },
  { key: "feedback", label: "Feedback" },
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

  const hasFailures =
    (data.outbox.events.failed ?? 0) +
      (data.outbox.notifications.failed ?? 0) +
      (data.outbox.signals.failed ?? 0) >
    0;
  const stuckTotal = data.stuck.notifications + data.stuck.events + data.stuck.expiredOpenSignals;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
        Pipeline overview <span style={{ color: "var(--muted)", fontSize: 13, fontWeight: 400 }}>· last 24h · live</span>
      </h1>

      {/* Service liveness */}
      <Grid min={200}>
        {data.heartbeats.map((h) => (
          <Stat
            key={h.service}
            label={h.service}
            value={<StatusBadge status={h.state} />}
            sub={<span title={fmtFull(h.last)}>last log {fmtAgo(h.last)}</span>}
            color={statusColor(h.state)}
          />
        ))}
      </Grid>

      {/* Funnel */}
      <Card title="Pipeline funnel (24h)">
        <div style={{ display: "flex", alignItems: "stretch", gap: 8, flexWrap: "wrap" }}>
          {FUNNEL.map((f, i) => (
            <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ textAlign: "center", minWidth: 110 }}>
                <div style={{ fontSize: 28, fontWeight: 700 }}>{data.funnel[f.key]}</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{f.label}</div>
              </div>
              {i < FUNNEL.length - 1 && <span style={{ color: "var(--muted)", fontSize: 18 }}>→</span>}
            </div>
          ))}
        </div>
      </Card>

      {/* Health row */}
      <Grid min={300}>
        <Card title="Outbox backlog" accent={hasFailures ? "#f85149" : undefined}>
          <Row label="events">
            <StatusCounts map={data.outbox.events} />
          </Row>
          <Row label="notifications">
            <StatusCounts map={data.outbox.notifications} />
          </Row>
          <Row label="signals">
            <StatusCounts map={data.outbox.signals} />
          </Row>
        </Card>

        <Card title="Stuck / attention" accent={stuckTotal > 0 ? "#d29922" : undefined}>
          <Row label="notifications processing >5m">
            <b style={{ color: data.stuck.notifications ? "#d29922" : undefined }}>{data.stuck.notifications}</b>
          </Row>
          <Row label="events processing >5m">
            <b style={{ color: data.stuck.events ? "#d29922" : undefined }}>{data.stuck.events}</b>
          </Row>
          <Row label="open signals past expiry">
            <b style={{ color: data.stuck.expiredOpenSignals ? "#d29922" : undefined }}>
              {data.stuck.expiredOpenSignals}
            </b>
          </Row>
        </Card>

        <Card title="Signal lifecycle">
          <StatusCounts map={data.signalStatus} />
          <div style={{ height: 10 }} />
          <div style={{ fontSize: 12, color: "var(--muted)" }}>analysis pipeline status</div>
          <Row label="events">
            <StatusCounts map={data.pipeline.events} />
          </Row>
          <Row label="notifications">
            <StatusCounts map={data.pipeline.notifications} />
          </Row>
        </Card>
      </Grid>

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
                <span style={{ color: "var(--muted)" }}>[{e.service}]</span>
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
