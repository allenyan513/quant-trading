"use client";

import Link from "next/link";
import { useLive } from "@/components/live";
import { Badge, Card, Grid, Stat, StatusBadge, statusColor } from "@/components/ui";
import { subsystemByName, type SubsystemName } from "@/lib/subsystems";

/**
 * Landing page for one subsystem, rendered as the index route of each
 * subsystem folder (/data, /alpha, /portfolio). Shows the 24h funnel,
 * the tables it solely owns, its outbox / lifecycle counters, and links to its
 * pages — making the service boundary the organising principle of the URL too.
 */

interface Overview {
  funnel: { events: number; notifications: number; signals: number; positions: number };
  outbox: {
    events: Record<string, number>;
    notifications: Record<string, number>;
    signals: Record<string, number>;
  };
  signalStatus: Record<string, number>;
  heartbeats: { service: string; last: string | null; state: string }[];
  stuck: { notifications: number; expiredOpenSignals: number };
}

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

export function SubsystemLanding({ name }: { name: SubsystemName }) {
  const sub = subsystemByName(name);
  const { data, error } = useLive<Overview>("/api/overview?windowHours=24");

  if (!sub) return null;
  if (error) return <div style={{ color: "#f85149" }}>Error: {String(error.message ?? error)}</div>;
  if (!data) return <p style={{ color: "var(--muted)" }}>Loading…</p>;

  const beat = data.heartbeats.find((h) => h.service === sub.name);

  // What flows through this subsystem in the 24h window, by name.
  const funnel: Record<SubsystemName, { label: string; value: number }[]> = {
    ingestion: [
      { label: "events", value: data.funnel.events },
      { label: "notifications", value: data.funnel.notifications },
    ],
    analysis: [{ label: "signals", value: data.funnel.signals }],
    portfolio: [{ label: "positions", value: data.funnel.positions }],
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ width: 14, height: 14, borderRadius: 4, background: sub.color }} />
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{sub.label}</h1>
        <Badge color={sub.color}>:{sub.port}</Badge>
        {beat && <StatusBadge status={beat.state} />}
      </div>
      <p style={{ color: "var(--muted)", margin: 0, maxWidth: 720, lineHeight: 1.6 }}>{sub.blurb}</p>

      <Grid min={170}>
        {funnel[sub.name].map((f) => (
          <Stat key={f.label} label={`${f.label} · 24h`} value={f.value} color={sub.color} />
        ))}
        <Stat
          label="liveness"
          value={<StatusBadge status={beat?.state ?? "unknown"} />}
          color={statusColor(beat?.state ?? "unknown")}
        />
      </Grid>

      <Grid min={300}>
        <Card title="独占表 (single-writer owner)" accent={sub.color}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {sub.tables.map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
          </div>
        </Card>

        {sub.name === "ingestion" && (
          <Card title="Outbox → analysis">
            <Row label="events">
              <StatusCounts map={data.outbox.events} />
            </Row>
            <Row label="notifications">
              <StatusCounts map={data.outbox.notifications} />
            </Row>
          </Card>
        )}
        {sub.name === "analysis" && (
          <>
            <Card title="Outbox → portfolio">
              <Row label="signals">
                <StatusCounts map={data.outbox.signals} />
              </Row>
            </Card>
            <Card title="Signal lifecycle">
              <StatusCounts map={data.signalStatus} />
            </Card>
          </>
        )}
        {sub.name === "portfolio" && (
          <Card title="Attention" accent={data.stuck.expiredOpenSignals > 0 ? "#d29922" : undefined}>
            <Row label="open signals past expiry">
              <b style={{ color: data.stuck.expiredOpenSignals ? "#d29922" : undefined }}>
                {data.stuck.expiredOpenSignals}
              </b>
            </Row>
          </Card>
        )}
      </Grid>

      <Card title="Pages">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {sub.pages.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text)",
                background: "var(--panel-2)",
                border: "1px solid var(--border)",
              }}
            >
              {p.label}
            </Link>
          ))}
        </div>
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
