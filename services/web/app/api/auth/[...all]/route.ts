/**
 * Better Auth catch-all handler — mounts every Better Auth endpoint under
 * /api/auth/* (sign-up/sign-in/session/… and, once the OAuth-provider plugin
 * lands in Phase 2, the OAuth AS endpoints). Node runtime: Better Auth uses a
 * pooled WebSocket DB connection + node crypto.
 */
import { auth } from "@/lib/auth-server";
import { toNextJsHandler } from "better-auth/next-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET, POST } = toNextJsHandler(auth);
