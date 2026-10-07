import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { clearAll, isSameOrigin } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError("bad_request", "Origin tidak valid.", 403);
  const res = NextResponse.json({ status: "ok" });
  clearAll(res);
  return res;
}
