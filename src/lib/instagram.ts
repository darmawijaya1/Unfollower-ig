import type { AuthErrorCode, IgUser, ListPage, ListType, ProfileInfo, SessionUser } from "./types";
import type { CookieJar } from "./session";

/**
 * Klien tipis untuk endpoint web Instagram (tidak resmi).
 *
 * Instagram tidak menyediakan API resmi untuk membaca daftar followers/following
 * akun pribadi, jadi aplikasi ini meniru request yang dikirim situs instagram.com.
 * Endpoint ini bisa berubah sewaktu-waktu tanpa pemberitahuan.
 */

const BASE_URL = (process.env.INSTAGRAM_BASE_URL || "https://www.instagram.com").replace(/\/$/, "");
const WEB_APP_ID = "936619743392459";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const REQUEST_TIMEOUT_MS = 20_000;
const PAGE_SIZE = 100;

/** Hanya cookie ini yang disimpan (menjaga ukuran cookie sesi tetap kecil). */
const KEPT_COOKIES = ["sessionid", "csrftoken", "ds_user_id", "mid", "ig_did"];

export class InstagramError extends Error {
  constructor(
    public code: AuthErrorCode,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

interface IgResponse {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any;
  jar: CookieJar;
}

export function mergeCookies(jar: CookieJar, headers: Headers): CookieJar {
  const next = { ...jar };
  for (const line of headers.getSetCookie()) {
    const pair = line.split(";")[0] ?? "";
    const idx = pair.indexOf("=");
    if (idx < 1) continue;
    const name = pair.slice(0, idx).trim();
    if (!KEPT_COOKIES.includes(name)) continue;
    const value = pair.slice(idx + 1).trim();
    if (!value || value === '""') delete next[name];
    else next[name] = value;
  }
  return next;
}

const cookieHeader = (jar: CookieJar) =>
  Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");

async function igRequest(
  path: string,
  opts: { method?: "GET" | "POST"; jar: CookieJar; form?: Record<string, string>; referer?: string },
): Promise<IgResponse> {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "X-IG-App-ID": WEB_APP_ID,
    "X-Requested-With": "XMLHttpRequest",
    Referer: opts.referer ?? `${BASE_URL}/`,
    Origin: BASE_URL,
  };
  const cookies = cookieHeader(opts.jar);
  if (cookies) headers.Cookie = cookies;
  if (opts.jar.csrftoken) headers["X-CSRFToken"] = opts.jar.csrftoken;

  let body: string | undefined;
  if (opts.form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(opts.form).toString();
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new InstagramError("unknown", "Tidak dapat terhubung ke Instagram. Coba lagi sebentar lagi.", 502);
  }

  let json: IgResponse["json"] = null;
  try {
    json = JSON.parse(await res.text());
  } catch {
    // Bukan JSON (mis. halaman HTML) — dibiarkan null.
  }
  return { status: res.status, json, jar: mergeCookies(opts.jar, res.headers) };
}

const isRateLimited = (r: IgResponse) =>
  r.status === 429 || r.json?.spam === true || /wait a few minutes/i.test(String(r.json?.message ?? ""));

const isCheckpoint = (r: IgResponse) =>
  r.json?.message === "checkpoint_required" || typeof r.json?.checkpoint_url === "string";

const rateLimitedError = () =>
  new InstagramError(
    "rate_limited",
    "Instagram membatasi permintaan sementara. Tunggu beberapa menit lalu coba lagi.",
    429,
  );

const checkpointError = () =>
  new InstagramError(
    "checkpoint",
    "Instagram meminta verifikasi keamanan (checkpoint). Buka aplikasi/situs Instagram, konfirmasi bahwa itu kamu, lalu coba lagi. Atau gunakan opsi upload data export.",
    403,
  );

export type LoginResult =
  | { kind: "ok"; userId: string; jar: CookieJar }
  | {
      kind: "two_factor";
      username: string;
      identifier: string;
      method: "totp" | "sms" | "unknown";
      phoneHint?: string;
      jar: CookieJar;
    };

function finishAuth(r: IgResponse): LoginResult {
  const userId = String(r.json?.userId ?? r.jar.ds_user_id ?? "");
  if (!r.jar.sessionid || !/^\d+$/.test(userId)) {
    throw new InstagramError("unknown", "Login tampak berhasil tetapi sesi tidak diterima dari Instagram.", 502);
  }
  return { kind: "ok", userId, jar: r.jar };
}

export async function login(username: string, password: string): Promise<LoginResult> {
  // 1) Ambil cookie awal (csrftoken, mid, ig_did).
  const boot = await igRequest("/accounts/login/", { jar: {} });
  if (boot.status === 429) throw rateLimitedError();
  if (!boot.jar.csrftoken) {
    throw new InstagramError(
      "unknown",
      "Instagram tidak mengizinkan permintaan login dari server ini. Coba lagi nanti atau gunakan opsi upload data export.",
      502,
    );
  }

  // 2) Kirim kredensial.
  const r = await igRequest("/api/v1/web/accounts/login/ajax/", {
    method: "POST",
    jar: boot.jar,
    referer: `${BASE_URL}/accounts/login/`,
    form: {
      username,
      enc_password: `#PWD_INSTAGRAM_BROWSER:0:${Math.floor(Date.now() / 1000)}:${password}`,
      queryParams: "{}",
      optIntoOneTap: "false",
      trustedDeviceRecords: "{}",
    },
  });
  const j = r.json ?? {};

  if (j.two_factor_required) {
    const info = j.two_factor_info ?? {};
    return {
      kind: "two_factor",
      username: String(info.username ?? username),
      identifier: String(info.two_factor_identifier ?? ""),
      method: info.totp_two_factor_on ? "totp" : info.sms_two_factor_on ? "sms" : "unknown",
      phoneHint: typeof info.obfuscated_phone_number === "string" ? info.obfuscated_phone_number : undefined,
      jar: r.jar,
    };
  }
  if (isCheckpoint(r)) throw checkpointError();
  if (isRateLimited(r)) throw rateLimitedError();
  if (j.authenticated === true) return finishAuth(r);
  if (j.authenticated === false || j.user === false) {
    throw new InstagramError("invalid_credentials", "Username atau password salah.", 401);
  }
  throw new InstagramError("unknown", "Respons login Instagram tidak dikenali. Coba lagi nanti.", 502);
}

export async function submitTwoFactor(
  pending: { username: string; identifier: string; jar: CookieJar },
  code: string,
): Promise<LoginResult> {
  const r = await igRequest("/api/v1/web/accounts/login/ajax/two_factor/", {
    method: "POST",
    jar: pending.jar,
    referer: `${BASE_URL}/accounts/login/two_factor`,
    form: {
      username: pending.username,
      verificationCode: code,
      identifier: pending.identifier,
      queryParams: '{"next":"/"}',
    },
  });
  if (isCheckpoint(r)) throw checkpointError();
  if (isRateLimited(r)) throw rateLimitedError();
  if (r.json?.authenticated === true) return finishAuth(r);
  if (r.status >= 400 || r.json?.status === "fail" || r.json?.authenticated === false) {
    throw new InstagramError("invalid_code", "Kode verifikasi salah atau sudah kedaluwarsa.", 401);
  }
  throw new InstagramError("unknown", "Respons verifikasi Instagram tidak dikenali. Coba lagi nanti.", 502);
}

/** Lempar error yang sesuai untuk respons endpoint yang butuh sesi login. */
function assertAuthedOk(r: IgResponse): void {
  if (
    r.status === 401 ||
    (r.status >= 300 && r.status < 400) ||
    r.json?.message === "login_required" ||
    r.json?.require_login === true
  ) {
    throw new InstagramError("session_expired", "Sesi Instagram berakhir. Silakan login ulang.", 401);
  }
  if (isCheckpoint(r)) throw checkpointError();
  if (isRateLimited(r)) throw rateLimitedError();
  if (r.status >= 400 || r.json?.status === "fail" || !r.json) {
    throw new InstagramError("unknown", "Instagram mengembalikan respons yang tidak terduga.", 502);
  }
}

export function mapUser(raw: Record<string, unknown>): IgUser | null {
  if (typeof raw.username !== "string" || !raw.username) return null;
  return {
    id: raw.pk !== undefined ? String(raw.pk) : raw.id !== undefined ? String(raw.id) : undefined,
    username: raw.username,
    fullName: typeof raw.full_name === "string" && raw.full_name ? raw.full_name : undefined,
    profilePicUrl: typeof raw.profile_pic_url === "string" ? raw.profile_pic_url : undefined,
    isPrivate: typeof raw.is_private === "boolean" ? raw.is_private : undefined,
    isVerified: typeof raw.is_verified === "boolean" ? raw.is_verified : undefined,
  };
}

export async function fetchListPage(
  session: SessionUser & { jar: CookieJar },
  type: ListType,
  cursor?: string,
): Promise<ListPage> {
  const qs = new URLSearchParams({ count: String(PAGE_SIZE) });
  if (cursor) qs.set("max_id", cursor);
  if (type === "followers") qs.set("search_surface", "follow_list_page");

  const r = await igRequest(`/api/v1/friendships/${session.userId}/${type}/?${qs}`, {
    jar: session.jar,
    referer: `${BASE_URL}/${session.username}/${type}/`,
  });
  assertAuthedOk(r);

  const rawUsers: unknown[] = Array.isArray(r.json.users) ? r.json.users : [];
  const users = rawUsers
    .map((u) => mapUser(u as Record<string, unknown>))
    .filter((u): u is IgUser => u !== null);
  const next = r.json.next_max_id;
  return { users, nextCursor: next !== undefined && next !== null && next !== "" ? String(next) : null };
}

export async function fetchProfile(session: SessionUser & { jar: CookieJar }): Promise<ProfileInfo> {
  const r = await igRequest(`/api/v1/users/${session.userId}/info/`, { jar: session.jar });
  assertAuthedOk(r);
  const u = r.json.user ?? {};
  return {
    username: typeof u.username === "string" ? u.username : session.username,
    fullName: typeof u.full_name === "string" && u.full_name ? u.full_name : undefined,
    profilePicUrl: typeof u.profile_pic_url === "string" ? u.profile_pic_url : undefined,
    followerCount: typeof u.follower_count === "number" ? u.follower_count : undefined,
    followingCount: typeof u.following_count === "number" ? u.following_count : undefined,
  };
}
