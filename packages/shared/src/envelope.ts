/**
 * JSON envelope contract — the stable machine-readable response shape for every
 * HTTP endpoint across the three services. Ported from
 * `legends/quant-researcher/quant_researcher/contract.py`.
 */
import { codeVersion } from "./config.js";

export const SCHEMA_VERSION = "1";

export interface ErrorDetail {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface Envelope<T = unknown> {
  ok: boolean;
  schema_version: string;
  as_of: string; // YYYY-MM-DD
  code_version: string;
  data: T | null;
  error: ErrorDetail | null;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ok<T>(data: T, asOf?: string): Envelope<T> {
  return {
    ok: true,
    schema_version: SCHEMA_VERSION,
    as_of: asOf ?? today(),
    code_version: codeVersion(),
    data,
    error: null,
  };
}

export function fail(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): Envelope<never> {
  return {
    ok: false,
    schema_version: SCHEMA_VERSION,
    as_of: today(),
    code_version: codeVersion(),
    data: null,
    error: { code, message, details },
  };
}
