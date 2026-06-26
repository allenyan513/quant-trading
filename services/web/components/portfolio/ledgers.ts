/** The three portfolio ledgers (account types). One layout, different data/actions. */
export type Ledger = "live" | "paper" | "strategy";

export const LEDGER_LABEL: Record<Ledger, string> = {
  live: "Live · IBKR",
  paper: "Paper",
  strategy: "Strategy",
};
