import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchListPage, InstagramError, login, mapUser, mergeCookies, submitTwoFactor } from "@/lib/instagram";

type Step = { status?: number; json?: unknown; text?: string; cookies?: string[] };

function mockFetch(steps: Step[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const step = steps.shift();
    if (!step) throw new Error("fetch dipanggil lebih banyak dari yang diharapkan");
    const headers = new Headers();
    for (const c of step.cookies ?? []) headers.append("set-cookie", c);
    return new Response(step.text ?? JSON.stringify(step.json ?? {}), { status: step.status ?? 200, headers });
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

const bootstrap: Step = { text: "<html></html>", cookies: ["csrftoken=tok123; Path=/", "mid=mid1; Path=/", "ig_did=did1; Path=/"] };

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe("mergeCookies", () => {
  it("hanya menyimpan cookie yang dibutuhkan dan menghapus cookie yang di-expire", () => {
    const h = new Headers();
    h.append("set-cookie", "sessionid=s1; Path=/; HttpOnly");
    h.append("set-cookie", "tracking=zzz; Path=/");
    h.append("set-cookie", 'mid=""; Max-Age=0');
    expect(mergeCookies({ mid: "old" }, h)).toEqual({ sessionid: "s1" });
  });
});

describe("login", () => {
  it("berhasil dan mengembalikan sesi", async () => {
    const calls = mockFetch([
      bootstrap,
      { json: { authenticated: true, user: true, userId: "123", status: "ok" }, cookies: ["sessionid=sess%3Aabc; Path=/", "ds_user_id=123; Path=/", "csrftoken=tok456; Path=/"] },
    ]);
    const result = await login("me", "hunter2");
    expect(result).toMatchObject({ kind: "ok", userId: "123", jar: { sessionid: "sess%3Aabc", csrftoken: "tok456" } });

    const post = calls[1];
    expect(post.url).toContain("/api/v1/web/accounts/login/ajax/");
    const headers = post.init.headers as Record<string, string>;
    expect(headers["X-CSRFToken"]).toBe("tok123");
    expect(headers.Cookie).toContain("csrftoken=tok123");
    const body = new URLSearchParams(String(post.init.body));
    expect(body.get("username")).toBe("me");
    expect(body.get("enc_password")).toMatch(/^#PWD_INSTAGRAM_BROWSER:0:\d+:hunter2$/);
  });

  it("meminta 2FA", async () => {
    mockFetch([
      bootstrap,
      { json: { two_factor_required: true, two_factor_info: { username: "me", two_factor_identifier: "ident1", totp_two_factor_on: true } } },
    ]);
    expect(await login("me", "pw")).toMatchObject({ kind: "two_factor", identifier: "ident1", method: "totp", username: "me" });
  });

  it("password salah", async () => {
    mockFetch([bootstrap, { json: { user: true, authenticated: false, status: "ok" } }]);
    await expect(login("me", "bad")).rejects.toMatchObject({ code: "invalid_credentials" });
  });

  it("checkpoint", async () => {
    mockFetch([bootstrap, { status: 400, json: { message: "checkpoint_required", checkpoint_url: "/challenge/1/", status: "fail" } }]);
    await expect(login("me", "pw")).rejects.toMatchObject({ code: "checkpoint" });
  });

  it("rate limit", async () => {
    mockFetch([bootstrap, { status: 429, json: { message: "Please wait a few minutes before you try again.", status: "fail" } }]);
    await expect(login("me", "pw")).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("gagal jika Instagram tidak memberi csrftoken", async () => {
    mockFetch([{ text: "blocked", status: 200 }]);
    await expect(login("me", "pw")).rejects.toBeInstanceOf(InstagramError);
  });

  it("error jaringan menjadi InstagramError, bukan crash", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    await expect(login("me", "pw")).rejects.toMatchObject({ code: "unknown", status: 502 });
  });
});

describe("submitTwoFactor", () => {
  const pending = { username: "me", identifier: "ident1", jar: { csrftoken: "tok", mid: "m" } };

  it("berhasil", async () => {
    const calls = mockFetch([{ json: { authenticated: true, userId: "7", status: "ok" }, cookies: ["sessionid=s; Path=/"] }]);
    expect(await submitTwoFactor(pending, "123456")).toMatchObject({ kind: "ok", userId: "7" });
    const body = new URLSearchParams(String(calls[0].init.body));
    expect(body.get("verificationCode")).toBe("123456");
    expect(body.get("identifier")).toBe("ident1");
  });

  it("kode salah", async () => {
    mockFetch([{ status: 400, json: { status: "fail", error_type: "sms_code_validation_code_invalid" } }]);
    await expect(submitTwoFactor(pending, "000000")).rejects.toMatchObject({ code: "invalid_code" });
  });
});

describe("fetchListPage", () => {
  const session = { userId: "42", username: "me", jar: { sessionid: "s", csrftoken: "c" } };

  it("memetakan user dan cursor", async () => {
    const calls = mockFetch([
      { json: { users: [{ pk: 1, username: "alice", full_name: "Alice", profile_pic_url: "http://x/a.jpg", is_private: true }, { pk: 2 }], next_max_id: "CURSOR2", status: "ok" } },
    ]);
    const page = await fetchListPage(session, "followers", "CURSOR1");
    expect(page.nextCursor).toBe("CURSOR2");
    expect(page.users).toEqual([
      { id: "1", username: "alice", fullName: "Alice", profilePicUrl: "http://x/a.jpg", isPrivate: true, isVerified: undefined },
    ]);
    expect(calls[0].url).toContain("/api/v1/friendships/42/followers/?");
    expect(calls[0].url).toContain("max_id=CURSOR1");
  });

  it("halaman terakhir → nextCursor null", async () => {
    mockFetch([{ json: { users: [], status: "ok" } }]);
    expect((await fetchListPage(session, "following")).nextCursor).toBeNull();
  });

  it("sesi berakhir", async () => {
    mockFetch([{ status: 400, json: { message: "login_required", require_login: true, status: "fail" } }]);
    await expect(fetchListPage(session, "following")).rejects.toMatchObject({ code: "session_expired", status: 401 });
  });

  it("rate limit", async () => {
    mockFetch([{ status: 429, json: { message: "Please wait a few minutes before you try again.", status: "fail" } }]);
    await expect(fetchListPage(session, "following")).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("respons HTML (bukan JSON) dianggap error, bukan data kosong", async () => {
    mockFetch([{ status: 200, text: "<html>login</html>" }]);
    await expect(fetchListPage(session, "following")).rejects.toBeInstanceOf(InstagramError);
  });
});

describe("mapUser", () => {
  it("menolak data tanpa username", () => {
    expect(mapUser({ pk: 1 })).toBeNull();
  });
});
