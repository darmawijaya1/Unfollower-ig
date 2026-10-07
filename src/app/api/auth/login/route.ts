import { NextRequest, NextResponse } from "next/server";
import { handleError, jsonError } from "@/lib/api";
import { fetchProfile, login } from "@/lib/instagram";
import { isSameOrigin, setPending, setSession } from "@/lib/session";
import type { LoginResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError("bad_request", "Origin tidak valid.", 403);

  let body: { username?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonError("bad_request", "Body request tidak valid.", 400);
  }

  const username = typeof body.username === "string" ? body.username.trim().replace(/^@/, "") : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username || /\s/.test(username) || username.length > 100 || !password || password.length > 256) {
    return jsonError("bad_request", "Username dan password wajib diisi.", 400);
  }

  try {
    const result = await login(username, password);

    if (result.kind === "two_factor") {
      const res = NextResponse.json<LoginResponse>({
        status: "two_factor",
        method: result.method,
        phoneHint: result.phoneHint,
      });
      setPending(res, {
        username: result.username,
        identifier: result.identifier,
        method: result.method,
        jar: result.jar,
      });
      return res;
    }

    // Login bisa memakai email/nomor telepon — ambil username aslinya dari profil.
    const profile = await fetchProfile({ userId: result.userId, username, jar: result.jar }).catch(() => null);
    const user = { userId: result.userId, username: profile?.username ?? username };
    const res = NextResponse.json<LoginResponse>({ status: "ok", user });
    setSession(res, { ...user, jar: result.jar });
    return res;
  } catch (error) {
    return handleError(error);
  }
}
