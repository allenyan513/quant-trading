import { handle, param } from "@/lib/api";
import { searchSymbols } from "@/lib/queries";

// Symbol autocomplete for the global command palette. Auth-gated (under /api).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => searchSymbols(param(req, "q") ?? ""));
}
