/** Client-facing memo shapes (dates arrive as ISO strings over JSON; `Date` server-side).
 *  Mirrors `@qt/shared/memo-read` MemoRow but with date fields widened for the wire. */

export interface MemoPosition {
  paper: { qty: number; avgCost: number } | null;
  live: { qty: number; avgCost: number | null; markPrice: number | null } | null;
}

export interface MemoContext {
  fairValue: number | null;
  upsidePct: number | null;
  verdict: string | null;
  position: MemoPosition;
}

export interface MemoSymbolView {
  symbol: string;
  priceAtWrite: number | null;
  priceTs: string | Date | null;
  valuationSnapshotId: string | null;
  context: MemoContext | null;
  attachedAt: string | Date;
}

export interface MemoView {
  id: string;
  type: string;
  title: string;
  markdown: string | null;
  direction: string | null;
  status: string;
  pinned: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
  symbols: MemoSymbolView[];
}

/** Accent color per memo type (badges). */
export const MEMO_TYPE_COLOR: Record<string, string> = {
  thesis: "#3fb950",
  review: "#a371f7",
  weekly: "#58a6ff",
  research: "#d29922",
  reflection: "#8a97ab",
  note: "#6e7681",
  morning_call: "#f0883e",
};

/** Color for a directional view. */
export const DIRECTION_COLOR: Record<string, string> = {
  long: "#3fb950",
  short: "#f85149",
  neutral: "#8a97ab",
};
