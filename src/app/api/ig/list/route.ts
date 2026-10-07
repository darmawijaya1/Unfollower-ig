import { NextRequest, NextResponse } from "next/server";
import { handleError, jsonError } from "@/lib/api";
import { fetchListPage } from "@/lib/instagram";
import { readSession } from "@/lib/session";
import type { ListType } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Mengambil SATU halaman daftar followers/following per request.
 * Klien yang mengulang sampai `nextCursor` null — menjaga tiap request
 * tetap singkat agar muat di batas waktu fungsi serverless Vercel.
 */
export async function GET(req: NextRequest) {
  try {
    const session = readSession(req);
    if (!session) return jsonError("not_logged_in", "Sesi berakhir. Silakan login ulang.", 401);

    const type = req.nextUrl.searchParams.get("type");
    if (type !== "followers" && type !== "following") {
      return jsonError("bad_request", "Parameter type harus followers atau following.", 400);
    }
    const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
    if (cursor !== undefined && cursor.length > 512) {
      return jsonError("bad_request", "Cursor tidak valid.", 400);
    }

    const page = await fetchListPage(session, type as ListType, cursor || undefined);
    return NextResponse.json({ status: "ok", ...page });
  } catch (error) {
    return handleError(error);
  }
}
