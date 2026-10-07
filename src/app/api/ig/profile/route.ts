import { NextRequest, NextResponse } from "next/server";
import { handleError, jsonError } from "@/lib/api";
import { fetchProfile } from "@/lib/instagram";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  try {
    const session = readSession(req);
    if (!session) return jsonError("session_expired", "Sesi berakhir. Silakan login ulang.", 401);
    const profile = await fetchProfile(session);
    return NextResponse.json({ status: "ok", profile });
  } catch (error) {
    return handleError(error);
  }
}
