import { NextResponse } from "next/server";
import { InstagramError } from "./instagram";
import { MissingSecretError } from "./session";
import type { AuthErrorCode } from "./types";

export function jsonError(code: AuthErrorCode, message: string, status: number) {
  return NextResponse.json({ status: "error" as const, code, message }, { status });
}

export function handleError(error: unknown) {
  if (error instanceof InstagramError) return jsonError(error.code, error.message, error.status);
  if (error instanceof MissingSecretError) {
    return jsonError("server_misconfigured", error.message, 500);
  }
  // Jangan pernah mencatat body request/respons — bisa berisi kredensial.
  console.error("[api] unexpected error:", error instanceof Error ? error.name : "unknown");
  return jsonError("unknown", "Terjadi kesalahan di server.", 500);
}
