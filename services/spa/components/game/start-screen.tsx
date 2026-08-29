/**
 * Start screen — pick a company, then get dropped somewhere random in its history.
 *
 * The blurbs matter more than they look. Most of this roster is deliberately NOT a
 * household name, so "ENPH" alone tells the player nothing; one line about what the
 * company does and why its chart is interesting is what makes the choice a decision
 * rather than a coin flip.
 */
import { GAME_UNIVERSE, INITIAL_CASH, type GameTicker } from "@qt/shared/game";
import { money } from "@/lib/format";

export function StartScreen({ onPick, loadingSymbol }: { onPick: (t: GameTicker) => void; loadingSymbol: string | null }) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", display: "flex", justifyContent: "center", padding: "48px 16px" }}>
      <div style={{ width: "100%", maxWidth: 900 }}>
        <h1 style={{ fontSize: 32, fontWeight: 600, margin: 0, letterSpacing: -0.5 }}>Replay</h1>
        <p style={{ color: "var(--muted)", fontSize: 15, marginTop: 10, marginBottom: 4, lineHeight: 1.6 }}>
          You wake up on a random trading day in the past with {money(INITIAL_CASH, "headline")} and one ticker. Read the
          news, trade the open, and walk forward one session at a time.
        </p>
        <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 28px", lineHeight: 1.6 }}>
          {/* Say the twist out loud — it's the rule that makes the game a game. */}
          You are not told when the game ends. It can settle on any day, so holding forever is a bet, not a plan. Your
          score is what you annualized — measured against buy &amp; hold over the exact same window.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: 10 }}>
          {GAME_UNIVERSE.map((t) => {
            const loading = loadingSymbol === t.symbol;
            return (
              <button
                key={t.symbol}
                onClick={() => onPick(t)}
                disabled={loadingSymbol != null}
                style={{
                  textAlign: "left",
                  padding: 14,
                  border: `1px solid ${loading ? "var(--accent)" : "var(--border)"}`,
                  background: "var(--panel)",
                  color: "var(--text)",
                  borderRadius: 6,
                  cursor: loadingSymbol ? "default" : "pointer",
                  opacity: loadingSymbol && !loading ? 0.45 : 1,
                  transition: "opacity 120ms, border-color 120ms",
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 15 }}>{t.symbol}</span>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>{t.name}</span>
                  {loading && <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--accent)" }}>Loading…</span>}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6, lineHeight: 1.5 }}>{t.blurb}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
