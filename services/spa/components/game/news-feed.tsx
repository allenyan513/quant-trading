/**
 * News feed — everything that has happened since the game opened, newest first, with the
 * current session pinned at the top.
 *
 * It used to show only today and then throw it away on the next click, which meant a
 * player who saw "downgraded to Neutral" had no way to check it three sessions later
 * when the stock was still sliding. Trading decisions build on a running memory of the
 * story, so the story has to stay on screen.
 *
 * The history starts at the game's first day, never earlier: the warm-up bars the chart
 * uses for its moving averages are context, not events the player lived through.
 */
import type { GameBar, GameEvent } from "@qt/shared/game";

const EVENT_STYLE: Record<GameEvent["kind"], { icon: string; color: string }> = {
  earnings: { icon: "◆", color: "#58a6ff" },
  filing: { icon: "▣", color: "#d29922" },
  rating: { icon: "★", color: "#a371f7" },
  move: { icon: "⚡", color: "#f0883e" },
  macro: { icon: "◇", color: "var(--muted)" },
  news: { icon: "●", color: "var(--muted)" },
};

/** Sessions of history kept. Deep enough to cover a quarter, bounded so a 1000-day game
 *  doesn't render thousands of nodes on every single "next day" click. */
const MAX_DAYS = 90;

export interface NewsDay {
  date: string;
  events: GameEvent[];
  isToday: boolean;
}

/** Days from the game's start through the cursor, newest first, empty sessions dropped. */
export function buildNewsDays(
  bars: GameBar[],
  startIndex: number,
  cursor: number,
  events: Record<string, GameEvent[]>,
): NewsDay[] {
  const out: NewsDay[] = [];
  for (let i = cursor; i >= startIndex && out.length < MAX_DAYS; i--) {
    const d = bars[i]?.d;
    if (!d) continue;
    const day = events[d];
    // The current session always shows, even empty — its "Quiet session" line is the
    // answer to "did I miss something today?", which a skipped row leaves unanswered.
    if (!day?.length && i !== cursor) continue;
    out.push({ date: d, events: day ?? [], isToday: i === cursor });
  }
  return out;
}

export function NewsFeed({ days }: { days: NewsDay[] }) {
  return (
    <div style={{ border: "1px solid var(--border)", background: "var(--panel)", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--muted)", padding: "10px 12px 6px" }}>News</div>
      <div style={{ overflowY: "auto", padding: "0 12px 12px" }}>
        {days.map((day) => (
          <section key={day.date} style={{ marginTop: 10 }}>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: day.isToday ? "var(--accent)" : "var(--muted)",
                borderBottom: "1px solid var(--border)",
                paddingBottom: 3,
                marginBottom: 6,
              }}
            >
              {day.date}
              {day.isToday && " · today"}
            </div>
            {day.events.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--muted)" }}>Quiet session. No material events.</div>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                {day.events.map((e, i) => {
                  const st = EVENT_STYLE[e.kind];
                  return (
                    <li key={`${e.kind}-${i}`} style={{ display: "flex", gap: 8, fontSize: 12, lineHeight: 1.4, opacity: day.isToday ? 1 : 0.72 }}>
                      <span style={{ color: st.color }}>{st.icon}</span>
                      <span>
                        <span>{e.title}</span>
                        {e.detail && <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 2 }}>{e.detail}</div>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
