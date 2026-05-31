import { NextResponse } from "next/server";
import { COOKIE_NAME, checkPassword, createSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let password = "";
  try {
    const body = await req.json();
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    password = "";
  }

  if (!checkPassword(password)) {
    return NextResponse.json({ error: "invalid_password" }, { status: 401 });
  }

  const { value, maxAgeSec } = await createSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSec,
  });
  return res;
}
