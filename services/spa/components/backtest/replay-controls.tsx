/**
 * Replay controls for the backtest chart — the play/skip button and the speed
 * pill, shared by the single-basket and comparison result panels.
 *
 * What is left of the old `ui.tsx`: everything in it that was not actually about
 * backtesting moved to `components/tool-ui.tsx` when the FIRE calculator became
 * the second tool on the site. These two stayed because they drive
 * `backtest-chart.tsx`'s replay and mean nothing without it.
 */
import { Play, SkipForward } from "lucide-react";

/**
 * The replay control, shared by the single-basket and comparison result panels.
 *
 * Solid rather than an outline chip: the replay is the thing worth doing on this
 * panel, and the first version — a small pill under the chart legend — was missed
 * entirely. One word plus a play glyph; the surrounding panel already says what is
 * being replayed, so "Replay this backtest" only made the button wide.
 */
export function ReplayButton({ playing, onClick }: { playing: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={playing ? "Skip the replay" : "Replay this backtest from the start"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 32,
        padding: "0 14px",
        borderRadius: 999,
        border: "none",
        background: "var(--accent)",
        color: "#06223f",
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {playing ? <SkipForward size={14} strokeWidth={2.5} /> : <Play size={14} strokeWidth={2.5} fill="currentColor" />}
      {playing ? "Skip" : "Replay"}
    </button>
  );
}

/**
 * Playback speed, shown ONLY while a replay is running.
 *
 * Deliberately not a permanent control: at rest it would be furniture for a
 * setting nobody has an opinion about yet. It appears at the exact moment someone
 * can form one — "this is slower than I want" — which is also how video players
 * do it. One pill that states the current speed and swaps on click, rather than a
 * segmented control that spends half its width on the option you are already on.
 *
 * Not a long-press menu: hiding a control behind a hold gesture on a primary
 * action is undiscoverable on desktop and fights text selection on touch.
 */
export function SpeedToggle({ speed, onChange }: { speed: number; onChange: (next: 1 | 2) => void }) {
  const next = speed === 1 ? 2 : 1;
  return (
    <button
      type="button"
      onClick={() => onChange(next)}
      aria-label={`Playback speed ${speed}x. Switch to ${next}x.`}
      title={`${speed}x — click for ${next}x`}
      style={{
        height: 32,
        minWidth: 36,
        padding: "0 10px",
        borderRadius: 999,
        border: "1px solid var(--border)",
        background: "transparent",
        color: "var(--muted)",
        fontSize: 12,
        fontWeight: 600,
        fontVariantNumeric: "tabular-nums",
        cursor: "pointer",
      }}
    >
      {speed}x
    </button>
  );
}
