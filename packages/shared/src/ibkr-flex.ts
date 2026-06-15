// ============================================================
// IBKR Flex Web Service client (ported from legends/value-scope).
//
// Two-step async flow:
//   1. SendRequest  → returns ReferenceCode
//   2. GetStatement → poll until Status=Success, returns the report (XML)
//
// See: https://www.interactivebrokers.com/campus/ibkr-api-page/flex-web-service/
//
// Single-account port: credentials come from config getters (not encrypted
// per-tenant blobs). The parsers + HTTP flow are unchanged from value-scope;
// constants are inlined here (matching how fmp.ts inlines its own).
// ============================================================

import { XMLParser } from "fast-xml-parser";

const IBKR_FLEX_BASE_URL =
  "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService";
// Poll backoff schedule (ms) — IBKR needs a few seconds to generate a statement.
const IBKR_POLL_BACKOFF_MS = [2000, 3000, 5000, 8000, 12000] as const;
const IBKR_POLL_MAX_ATTEMPTS = IBKR_POLL_BACKOFF_MS.length;
// Per-request timeout — Node's fetch has none by default, so a hung IBKR
// endpoint would block the sync indefinitely. Surfaces as a classified timeout.
const IBKR_HTTP_TIMEOUT_MS = 20_000;
/** Standard US equity-option contract multiplier (shares per contract). */
export const OPTION_CONTRACT_MULTIPLIER = 100;

export interface FlexConfig {
  token: string;
  queryId: string;
}

export type SyncFailureReason =
  | "token_expired"
  | "xml_parse_error"
  | "timeout"
  | "http_error"
  | "unknown";

export class IBKRFlexError extends Error {
  readonly reason: SyncFailureReason;
  constructor(reason: SyncFailureReason, message: string) {
    super(message);
    this.name = "IBKRFlexError";
    this.reason = reason;
  }
}

// ── Report shapes ───────────────────────────────────────────
export interface FlexNavRow {
  date: string; // YYYY-MM-DD
  startingNav: number;
  endingNav: number;
  mtmPnl: number;
  depositsWithdrawals: number; // IBKR aggregates external flows into one signed number
  /** Pre-computed TWR % for the period as returned by IBKR (e.g. 1.397934892 = +1.39%) */
  twrPct: number;
}

export interface FlexTradeRow {
  /** Broker-native trade id used as the per-account idempotency key (IBKR `tradeID`, fallback `transactionID`). */
  externalTradeId: string;
  tradeDate: string;
  symbol: string;
  assetClass: string; // 'STK'|'OPT'|'CASH'|...
  action: string; // 'BUY'|'SELL'
  quantity: number;
  price: number;
  optionType?: "CALL" | "PUT";
  strike?: number;
  expiry?: string;
}

export interface FlexPositionRow {
  asOf: string;
  symbol: string;
  assetClass: string;
  positionValue: number;
  /** IBKR-computed % of NAV (already aggregated at the SUMMARY level). */
  percentOfNav?: number;
  quantity: number;
  /** Cost basis per share/contract (IBKR `costBasisPrice`). */
  avgPrice?: number;
  /** Current mark price per share/contract (IBKR `markPrice`). */
  markPrice?: number;
  optionType?: "CALL" | "PUT";
  strike?: number;
  expiry?: string;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
}

/**
 * One daily account snapshot from the "NAV in Base" section. `totalNav` is
 * end-of-day NAV in the account's base currency. We compute daily returns
 * from consecutive totals.
 */
export interface FlexEquityRow {
  date: string;
  totalNav: number;
}

/** End-of-period cash balance. We only keep the base-currency summary row. */
export interface FlexCashRow {
  date: string;
  endingCash: number;
}

export interface FlexStatement {
  nav: FlexNavRow[];
  trades: FlexTradeRow[];
  positions: FlexPositionRow[];
  /** Daily NAV-in-base series (empty when the NAV-in-Base section isn't enabled). */
  equity: FlexEquityRow[];
  /** Ending cash in base currency (empty when Cash Report isn't enabled). */
  cash: FlexCashRow[];
  endingNavTotal?: number; // for weight_pct derivation
}

// ── XML parsing helpers ─────────────────────────────────────
// fast-xml-parser attributeNamePrefix="" makes attributes first-class keys and
// ignoreAttributes=false exposes them. IBKR Flex reports are attribute-heavy and
// emit each section as one or more flat siblings under FlexStatement; forcing
// the row tags to array makes the single-row case work like the multi-row case.
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  isArray: (name) =>
    [
      "Trade",
      "OpenPosition",
      "ChangeInNAV",
      "EquitySummaryByReportDateInBase",
      "CashReportCurrency",
    ].includes(name),
});

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function toNum(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
}

function toNumOrUndef(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
}

// IBKR dates arrive as YYYYMMDD, YYYY-MM-DD, or ISO timestamp — normalize to YYYY-MM-DD.
function toIsoDate(v: unknown): string {
  if (!v) return "";
  const s = String(v).trim();
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

function normalizeOptionType(v: unknown): "CALL" | "PUT" | undefined {
  if (v == null) return undefined;
  const s = String(v).toUpperCase();
  if (s === "C" || s === "CALL") return "CALL";
  if (s === "P" || s === "PUT") return "PUT";
  return undefined;
}

// ── Top-level HTTP flow ─────────────────────────────────────
interface SendRequestResponse {
  FlexStatementResponse?: {
    Status?: string;
    ReferenceCode?: string;
    Url?: string;
    ErrorCode?: string;
    ErrorMessage?: string;
  };
}

interface GetStatementResponse {
  FlexQueryResponse?: unknown;
  FlexStatementResponse?: {
    Status?: string;
    ErrorCode?: string;
    ErrorMessage?: string;
  };
}

/** Classify IBKR error codes. 1019=token expired, 1020=invalid request (often bad token or queryId). */
function classifyError(
  code: string | number | undefined,
  message: string | undefined,
): SyncFailureReason {
  // fast-xml-parser coerces numeric tag values to numbers by default.
  const codeStr = code != null ? String(code) : undefined;
  if (codeStr === "1019") return "token_expired";
  if (codeStr === "1020") {
    // 1020 is ambiguous — could be expired token OR wrong queryId. Bias towards
    // token_expired since that's the most common operator-facing cause.
    return "token_expired";
  }
  if (message && /token/i.test(message) && /(expired|invalid)/i.test(message)) {
    return "token_expired";
  }
  return "unknown";
}

/** fetch with a hard timeout; maps abort/network errors to a classified IBKRFlexError. */
async function flexFetch(url: string): Promise<Response> {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(IBKR_HTTP_TIMEOUT_MS) });
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new IBKRFlexError("timeout", `IBKR request timed out after ${IBKR_HTTP_TIMEOUT_MS}ms`);
    }
    throw new IBKRFlexError("http_error", e instanceof Error ? e.message : String(e));
  }
}

export async function sendFlexRequest(cfg: FlexConfig): Promise<string> {
  const url = `${IBKR_FLEX_BASE_URL}/SendRequest?t=${encodeURIComponent(cfg.token)}&q=${encodeURIComponent(cfg.queryId)}&v=3`;
  const res = await flexFetch(url);
  if (!res.ok) {
    throw new IBKRFlexError("http_error", `SendRequest HTTP ${res.status}`);
  }
  const xml = await res.text();
  const parsed = parser.parse(xml) as SendRequestResponse;
  const r = parsed.FlexStatementResponse;
  if (!r) throw new IBKRFlexError("xml_parse_error", "No FlexStatementResponse in SendRequest reply");
  if (r.Status !== "Success" || !r.ReferenceCode) {
    const reason = classifyError(r.ErrorCode, r.ErrorMessage);
    throw new IBKRFlexError(
      reason,
      `SendRequest failed: ${r.ErrorCode ?? "?"} ${r.ErrorMessage ?? "unknown"}`,
    );
  }
  return String(r.ReferenceCode);
}

export async function pollStatement(refCode: string, cfg: FlexConfig): Promise<string> {
  const url = `${IBKR_FLEX_BASE_URL}/GetStatement?q=${encodeURIComponent(refCode)}&t=${encodeURIComponent(cfg.token)}&v=3`;

  for (let attempt = 0; attempt < IBKR_POLL_MAX_ATTEMPTS; attempt++) {
    await sleep(IBKR_POLL_BACKOFF_MS[attempt]!);
    const res = await flexFetch(url);
    if (!res.ok) throw new IBKRFlexError("http_error", `GetStatement HTTP ${res.status}`);
    const xml = await res.text();

    // Success path: IBKR returns FlexQueryResponse with actual data.
    if (xml.includes("<FlexQueryResponse")) return xml;

    // Pending or error — parse the small envelope to decide.
    const parsed = parser.parse(xml) as GetStatementResponse;
    const r = parsed.FlexStatementResponse;
    if (!r) throw new IBKRFlexError("xml_parse_error", "Unexpected GetStatement response shape");
    if (r.Status === "Warn" || r.Status === "Fail") {
      const reason = classifyError(r.ErrorCode, r.ErrorMessage);
      throw new IBKRFlexError(reason, `GetStatement ${r.Status}: ${r.ErrorCode ?? "?"} ${r.ErrorMessage ?? ""}`);
    }
    // else: InProgress — keep polling
  }
  throw new IBKRFlexError("timeout", `GetStatement still pending after ${IBKR_POLL_MAX_ATTEMPTS} attempts`);
}

// ── Parsers for each section ────────────────────────────────
interface ParsedFlex {
  FlexQueryResponse?: {
    FlexStatements?: {
      FlexStatement?: FlexStatementBlock | FlexStatementBlock[];
    };
  };
}

// IBKR nests row tags inside container tags whose names are the plural form:
//   <Trades><Trade .../></Trades>
//   <OpenPositions><OpenPosition .../></OpenPositions>
//   <EquitySummaryInBase><EquitySummaryByReportDateInBase .../></EquitySummaryInBase>
// The Change-in-NAV section is different — the row is a flat direct child of
// FlexStatement with NO container wrapper.
interface FlexStatementBlock {
  ChangeInNAV?: unknown; // flat; array via isArray
  CashReport?: { CashReportCurrency?: unknown }; // nested
  Trades?: { Trade?: unknown }; // nested
  OpenPositions?: { OpenPosition?: unknown }; // nested
  EquitySummaryInBase?: { EquitySummaryByReportDateInBase?: unknown }; // nested daily NAV series
}

function rootStatements(xml: string): FlexStatementBlock[] {
  const parsed = parser.parse(xml) as ParsedFlex;
  const raw = parsed.FlexQueryResponse?.FlexStatements?.FlexStatement;
  return asArray(raw);
}

/**
 * Parse the Change-in-NAV section. IBKR emits ChangeInNAV as a flat sibling of
 * FlexStatement (not nested). Key attrs: fromDate, toDate, startingValue,
 * endingValue, mtm, depositsWithdrawals, twr. "Last Business Day" = one row.
 */
export function parseNavReport(xml: string): FlexNavRow[] {
  const statements = rootStatements(xml);
  const rows: FlexNavRow[] = [];
  for (const st of statements) {
    const items = asArray(st.ChangeInNAV) as Array<Record<string, unknown>>;
    for (const item of items) {
      const date = toIsoDate(item.toDate ?? item.reportDate ?? item.fromDate);
      if (!date) continue;
      rows.push({
        date,
        startingNav: toNum(item.startingValue),
        endingNav: toNum(item.endingValue),
        mtmPnl: toNum(item.mtm),
        depositsWithdrawals: toNum(item.depositsWithdrawals),
        twrPct: toNum(item.twr),
      });
    }
  }
  return rows;
}

/**
 * Parse Trades. Each <Trade/> is a flat sibling under FlexStatement. The same
 * trade may appear at multiple levelOfDetail values (EXECUTION / ORDER / TRADE);
 * we keep only EXECUTION rows so each leg counts once.
 */
export function parseTradesReport(xml: string): FlexTradeRow[] {
  const statements = rootStatements(xml);
  const rows: FlexTradeRow[] = [];
  for (const st of statements) {
    const items = asArray(st.Trades?.Trade) as Array<Record<string, unknown>>;
    for (const t of items) {
      const level = String(t.levelOfDetail ?? "EXECUTION").toUpperCase();
      if (level && level !== "EXECUTION") continue;
      const externalTradeId =
        (t.tradeID as string | undefined) ??
        (t.transactionID as string | undefined) ??
        `${toIsoDate(t.tradeDate)}-${t.symbol ?? ""}-${t.quantity ?? ""}-${t.price ?? ""}`;
      const assetClass = String(t.assetCategory ?? "STK");
      const plainSymbol =
        assetClass === "OPT"
          ? String(t.underlyingSymbol ?? t.symbol ?? "")
          : String(t.symbol ?? t.underlyingSymbol ?? "");
      rows.push({
        externalTradeId: String(externalTradeId),
        tradeDate: toIsoDate(t.tradeDate),
        symbol: plainSymbol,
        assetClass,
        action: String(t.buySell ?? ""),
        quantity: toNum(t.quantity),
        price: toNum(t.tradePrice ?? t.price),
        optionType: normalizeOptionType(t.putCall),
        strike: toNumOrUndef(t.strike),
        expiry: t.expiry ? toIsoDate(t.expiry) : undefined,
      });
    }
  }
  return rows;
}

/**
 * Parse Open Positions. IBKR emits each symbol at multiple levelOfDetail values
 * (SUMMARY aggregates the LOT rows). We keep SUMMARY rows as the canonical
 * position, then scan LOT rows purely to recover option Greeks — IBKR often
 * emits Greeks only on LOT rows even when the Flex Query enables them on Summary.
 *
 * Options carry two symbol fields: `symbol` is the OCC-padded contract id
 * (e.g. "MSFT  260417C00400000") and `underlyingSymbol` is the plain ticker.
 * We always prefer the plain ticker so downstream links resolve.
 */
export function parsePositionsReport(xml: string): FlexPositionRow[] {
  const statements = rootStatements(xml);
  const summaries: FlexPositionRow[] = [];
  const lotGreeks = new Map<
    string,
    { delta?: number; gamma?: number; theta?: number; vega?: number }
  >();

  for (const st of statements) {
    const items = asArray(st.OpenPositions?.OpenPosition) as Array<Record<string, unknown>>;
    for (const p of items) {
      const level = String(p.levelOfDetail ?? "SUMMARY").toUpperCase();
      const assetClass = String(p.assetCategory ?? "STK");
      const isOpt = assetClass === "OPT";
      const plainSymbol = isOpt
        ? String(p.underlyingSymbol ?? p.symbol ?? "")
        : String(p.symbol ?? p.underlyingSymbol ?? "");

      if (level === "LOT") {
        // Only retain LOT rows if they carry Greeks we might need later.
        if (!isOpt) continue;
        const delta = toNumOrUndef(p.delta);
        const gamma = toNumOrUndef(p.gamma);
        const theta = toNumOrUndef(p.theta);
        const vega = toNumOrUndef(p.vega);
        if (delta == null && gamma == null && theta == null && vega == null) continue;
        const key = lotKey(
          toIsoDate(p.reportDate ?? p.date),
          plainSymbol,
          toNumOrUndef(p.strike),
          p.expiry ? toIsoDate(p.expiry) : undefined,
          normalizeOptionType(p.putCall),
        );
        const existing = lotGreeks.get(key);
        lotGreeks.set(key, {
          delta: existing?.delta ?? delta,
          gamma: existing?.gamma ?? gamma,
          theta: existing?.theta ?? theta,
          vega: existing?.vega ?? vega,
        });
        continue;
      }
      if (level !== "SUMMARY") continue;

      summaries.push({
        asOf: toIsoDate(p.reportDate ?? p.date),
        symbol: plainSymbol,
        assetClass,
        positionValue: toNum(p.positionValue ?? p.markValue),
        percentOfNav: toNumOrUndef(p.percentOfNAV),
        quantity: toNum(p.position ?? p.quantity),
        avgPrice: toNumOrUndef(p.costBasisPrice),
        markPrice: toNumOrUndef(p.markPrice),
        optionType: normalizeOptionType(p.putCall),
        strike: toNumOrUndef(p.strike),
        expiry: p.expiry ? toIsoDate(p.expiry) : undefined,
        delta: toNumOrUndef(p.delta),
        gamma: toNumOrUndef(p.gamma),
        theta: toNumOrUndef(p.theta),
        vega: toNumOrUndef(p.vega),
      });
    }
  }

  // Second pass: merge LOT Greeks into any option SUMMARY row missing them.
  for (const row of summaries) {
    if (row.assetClass !== "OPT") continue;
    if (row.delta != null && row.gamma != null && row.theta != null && row.vega != null) continue;
    const key = lotKey(row.asOf, row.symbol, row.strike, row.expiry, row.optionType);
    const greeks = lotGreeks.get(key);
    if (!greeks) continue;
    if (row.delta == null) row.delta = greeks.delta;
    if (row.gamma == null) row.gamma = greeks.gamma;
    if (row.theta == null) row.theta = greeks.theta;
    if (row.vega == null) row.vega = greeks.vega;
  }

  return summaries;
}

function lotKey(
  asOf: string,
  symbol: string,
  strike: number | undefined,
  expiry: string | undefined,
  optionType: "CALL" | "PUT" | undefined,
): string {
  return [asOf, symbol, strike ?? "", expiry ?? "", optionType ?? ""].join("|");
}

/**
 * Parse the "NAV in Base" section — daily end-of-day NAV snapshots. Present only
 * when the historical query enables this section; the daily-incremental query
 * emits only ChangeInNAV and returns [].
 */
export function parseEquitySummaryReport(xml: string): FlexEquityRow[] {
  const statements = rootStatements(xml);
  const rows: FlexEquityRow[] = [];
  for (const st of statements) {
    const items = asArray(
      st.EquitySummaryInBase?.EquitySummaryByReportDateInBase,
    ) as Array<Record<string, unknown>>;
    for (const item of items) {
      const date = toIsoDate(item.reportDate);
      const total = toNum(item.total);
      if (!date || total <= 0) continue;
      rows.push({ date, totalNav: total });
    }
  }
  return rows;
}

/**
 * Parse the "Cash Report" section. IBKR emits one CashReportCurrency per
 * currency plus a `currency="BASE_SUMMARY"` aggregate. We keep only the
 * base-summary row. Returns [] when the section is absent.
 */
export function parseCashReport(xml: string): FlexCashRow[] {
  const statements = rootStatements(xml);
  const rows: FlexCashRow[] = [];
  for (const st of statements) {
    const items = asArray(st.CashReport?.CashReportCurrency) as Array<Record<string, unknown>>;
    for (const item of items) {
      if (String(item.currency ?? "") !== "BASE_SUMMARY") continue;
      const date = toIsoDate(item.toDate ?? item.reportDate ?? item.fromDate);
      const endingCash = toNum(item.endingCash ?? item.endingSettledCash);
      if (!date) continue;
      rows.push({ date, endingCash });
    }
  }
  return rows;
}

/** Ending NAV of the latest Change-in-NAV row (fallback for weight_pct derivation). */
function deriveEndingNav(rows: FlexNavRow[]): number | undefined {
  if (rows.length === 0) return undefined;
  const sorted = [...rows].sort((a, b) => (a.date < b.date ? -1 : 1));
  return sorted[sorted.length - 1]!.endingNav;
}

/**
 * Fetch one Flex Query and parse all sections. Throws IBKRFlexError for
 * classified failures so the caller can log a precise reason.
 */
export async function fetchFlexStatement(cfg: FlexConfig): Promise<FlexStatement> {
  const refCode = await sendFlexRequest(cfg);
  const xml = await pollStatement(refCode, cfg);
  try {
    const nav = parseNavReport(xml);
    const trades = parseTradesReport(xml);
    const positions = parsePositionsReport(xml);
    const equity = parseEquitySummaryReport(xml);
    const cash = parseCashReport(xml);
    return { nav, trades, positions, equity, cash, endingNavTotal: deriveEndingNav(nav) };
  } catch (e) {
    throw new IBKRFlexError("xml_parse_error", e instanceof Error ? e.message : String(e));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
