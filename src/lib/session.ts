import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { NextResponse } from "next/server";
import type { SessionUser } from "./types";

/**
 * Sesi disimpan di cookie httpOnly yang dienkripsi (AES-256-GCM).
 * Server tidak menyimpan apa pun — cocok untuk serverless di Vercel.
 */

export const SESSION_COOKIE = "ig_session";
export const PENDING_COOKIE = "ig_pending";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const PENDING_TTL_SECONDS = 60 * 10;

export type CookieJar = Record<string, string>;

export interface SessionPayload extends SessionUser {
  jar: CookieJar;
}

export interface PendingPayload {
  username: string;
  identifier: string;
  method: "totp" | "sms" | "unknown";
  jar: CookieJar;
}

export class MissingSecretError extends Error {
  constructor() {
    super("SESSION_SECRET belum diatur di environment variables.");
  }
}

function getKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 16) return createHash("sha256").update(secret).digest();
  if (process.env.NODE_ENV === "production") throw new MissingSecretError();
  // Hanya untuk development lokal.
  return createHash("sha256").update("dev-only-insecure-secret").digest();
}

export function seal(payload: object, ttlSeconds: number): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const body = JSON.stringify({ p: payload, exp: Date.now() + ttlSeconds * 1000 });
  const data = Buffer.concat([cipher.update(body, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}

export function unseal<T>(token: string | undefined): T | null {
  if (!token) return null;
  try {
    const raw = Buffer.from(token, "base64url");
    if (raw.length < 29) return null;
    const decipher = createDecipheriv("aes-256-gcm", getKey(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const body = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    const { p, exp } = JSON.parse(body) as { p: T; exp: number };
    if (typeof exp !== "number" || exp < Date.now()) return null;
    return p;
  } catch (error) {
    if (error instanceof MissingSecretError) throw error;
    return null;
  }
}

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});

export function setSession(res: NextResponse, payload: SessionPayload): void {
  res.cookies.set(SESSION_COOKIE, seal(payload, SESSION_TTL_SECONDS), cookieOptions(SESSION_TTL_SECONDS));
  res.cookies.set(PENDING_COOKIE, "", cookieOptions(0));
}

export function setPending(res: NextResponse, payload: PendingPayload): void {
  res.cookies.set(PENDING_COOKIE, seal(payload, PENDING_TTL_SECONDS), cookieOptions(PENDING_TTL_SECONDS));
}

export function clearAll(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", cookieOptions(0));
  res.cookies.set(PENDING_COOKIE, "", cookieOptions(0));
}

export function readSession(req: { cookies: { get(name: string): { value: string } | undefined } }): SessionPayload | null {
  return unseal<SessionPayload>(req.cookies.get(SESSION_COOKIE)?.value);
}

export function readPending(req: { cookies: { get(name: string): { value: string } | undefined } }): PendingPayload | null {
  return unseal<PendingPayload>(req.cookies.get(PENDING_COOKIE)?.value);
}

/**
 * Perlindungan CSRF tambahan untuk endpoint yang mengubah state:
 * jika browser mengirim header Origin, host-nya harus sama dengan host request.
 */
export function isSameOrigin(req: { headers: Headers }): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
