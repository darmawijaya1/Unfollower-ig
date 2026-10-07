import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isSameOrigin, MissingSecretError, seal, unseal } from "@/lib/session";

const env = process.env as Record<string, string | undefined>;
const original = { ...env };

beforeEach(() => {
  env.SESSION_SECRET = "a-very-long-test-secret-0123456789";
  env.NODE_ENV = "test";
});
afterEach(() => {
  vi.useRealTimers();
  env.SESSION_SECRET = original.SESSION_SECRET;
  env.NODE_ENV = original.NODE_ENV;
});

describe("seal/unseal", () => {
  it("bolak-balik payload dengan benar", () => {
    const payload = { userId: "1", username: "me", jar: { sessionid: "abc%3Adef" } };
    expect(unseal<typeof payload>(seal(payload, 60))).toEqual(payload);
  });

  it("menolak token yang diubah", () => {
    const token = seal({ a: 1 }, 60);
    const tampered = token.slice(0, -2) + (token.endsWith("AA") ? "BB" : "AA");
    expect(unseal(tampered)).toBeNull();
  });

  it("menolak token dari secret berbeda", () => {
    const token = seal({ a: 1 }, 60);
    env.SESSION_SECRET = "another-secret-another-secret-123";
    expect(unseal(token)).toBeNull();
  });

  it("menolak token kedaluwarsa", () => {
    vi.useFakeTimers();
    const token = seal({ a: 1 }, 60);
    vi.advanceTimersByTime(61_000);
    expect(unseal(token)).toBeNull();
  });

  it("mengembalikan null untuk input kosong/sampah", () => {
    expect(unseal(undefined)).toBeNull();
    expect(unseal("")).toBeNull();
    expect(unseal("not-a-token")).toBeNull();
  });

  it("tidak menyimpan password/plaintext terbaca di dalam token", () => {
    const token = seal({ jar: { sessionid: "SUPERSECRETVALUE" } }, 60);
    expect(Buffer.from(token, "base64url").toString("utf8")).not.toContain("SUPERSECRETVALUE");
  });

  it("di production wajib ada SESSION_SECRET", () => {
    env.NODE_ENV = "production";
    delete env.SESSION_SECRET;
    expect(() => seal({}, 60)).toThrow(MissingSecretError);
  });
});

describe("isSameOrigin", () => {
  const req = (headers: Record<string, string>) => ({ headers: new Headers(headers) });
  it("menerima origin yang sama dan request tanpa Origin", () => {
    expect(isSameOrigin(req({ origin: "https://app.vercel.app", host: "app.vercel.app" }))).toBe(true);
    expect(isSameOrigin(req({ host: "app.vercel.app" }))).toBe(true);
  });
  it("menolak origin berbeda", () => {
    expect(isSameOrigin(req({ origin: "https://evil.example", host: "app.vercel.app" }))).toBe(false);
    expect(isSameOrigin(req({ origin: "not a url", host: "app.vercel.app" }))).toBe(false);
  });
});
