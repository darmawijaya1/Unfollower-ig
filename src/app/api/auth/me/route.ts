import { NextRequest, NextResponse } from "next/server";
import { handleError, jsonError } from "@/lib/api";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const session = readSession(req);
    if (!session) return jsonError("session_expired", "Belum login.", 401);
    return NextResponse.json({ status: "ok", user: { userId: session.userId, username: session.username } });
  } catch (error) {
    return handleError(error);
  }
}
