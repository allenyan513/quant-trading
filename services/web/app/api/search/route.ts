import { param } from "@/lib/api";
import { searchSymbols } from "@/lib/queries";
import { publicRoute } from "@/lib/route";

// Symbol autocomplete for the global command palette. Auth-gated (under /api).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = publicRoute((req) => searchSymbols(param(req, "q") ?? ""));
