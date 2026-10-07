import { NextRequest, NextResponse } from "next/server";
import { handleError, jsonError } from "@/lib/api";
import { fetchProfile, submitTwoFactor } from "@/lib/instagram";
import { isSameOrigin, readPending, setSession } from "@/lib/session";
import type { LoginResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError("bad_request", "Origin tidak valid.", 403);

  let body: { code?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonError("bad_request", "Body request tidak valid.", 400);
  }
  const code = typeof body.code === "string" ? body.code.replace(/\s/g, "") : "";
  if (!/^\d{6,8}$/.test(code)) {
    return jsonError("invalid_code", "Kode verifikasi harus 6–8 digit angka.", 400);
  }

  try {
    const pending = readPending(req);
    if (!pending) {
      return jsonError("bad_request", "Sesi verifikasi habis. Silakan login ulang.", 400);
    }

    const result = await submitTwoFactor(pending, code);
    if (result.kind !== "ok") {
      return jsonError("unknown", "Verifikasi tidak dapat diselesaikan.", 502);
    }

    const profile = await fetchProfile({
      userId: result.userId,
      username: pending.username,
      jar: result.jar,
    }).catch(() => null);
    const user = { userId: result.userId, username: profile?.username ?? pending.username };
    const res = NextResponse.json<LoginResponse>({ status: "ok", user });
    setSession(res, { ...user, jar: result.jar });
    return res;
  } catch (error) {
    return handleError(error);
  }
}
