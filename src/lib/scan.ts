import type { IgUser, ListPage, ListType } from "./types";

export class ScanError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface ListProgress {
  users: IgUser[];
  cursor: string | null;
  done: boolean;
}

export interface ScanState {
  followers: ListProgress;
  following: ListProgress;
}

export const emptyScan = (): ScanState => ({
  followers: { users: [], cursor: null, done: false },
  following: { users: [], cursor: null, done: false },
});

const MAX_PAGES_PER_LIST = 500;
const MAX_RETRIES = 2;

/** Setelah sekian halaman berturut-turut, istirahat lebih lama. */
export const REST_EVERY_PAGES = 6;

/**
 * Jeda (ms) setelah `pagesDone` halaman. Scan yang terlalu rapat membuat Instagram
 * menolak sesi di tengah jalan, jadi jeda sengaja acak (3–6 dtk) dengan istirahat
 * panjang (20–30 dtk) berkala. Ini mengurangi — bukan menjamin bebas — pembatasan.
 */
export function delayAfterPage(pagesDone: number, random: () => number = Math.random): number {
  if (pagesDone > 0 && pagesDone % REST_EVERY_PAGES === 0) return 20_000 + random() * 10_000;
  return 3_000 + random() * 3_000;
}

const abortError = () => new DOMException("Aborted", "AbortError");

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function wait(ms: number, signal: AbortSignal, onWait?: (ms: number | null) => void): Promise<void> {
  onWait?.(ms);
  try {
    await sleep(ms, signal);
  } finally {
    onWait?.(null);
  }
}

async function fetchPage(
  type: ListType,
  cursor: string | null,
  signal: AbortSignal,
): Promise<ListPage> {
  const qs = new URLSearchParams({ type });
  if (cursor) qs.set("cursor", cursor);

  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`/api/ig/list?${qs}`, { signal, cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.status === "ok") {
        return { users: data.users as IgUser[], nextCursor: (data.nextCursor as string | null) ?? null };
      }
      const code = typeof data?.code === "string" ? data.code : "unknown";
      const message = typeof data?.message === "string" ? data.message : "Gagal mengambil data.";
      // Hanya error sementara (jaringan/5xx) yang dicoba ulang otomatis.
      if (res.status >= 500 && code === "unknown" && attempt < MAX_RETRIES) {
        await sleep(3000 * (attempt + 1), signal);
        continue;
      }
      throw new ScanError(code, message);
    } catch (error) {
      if (error instanceof ScanError || signal.aborted) throw error;
      if (attempt < MAX_RETRIES) {
        await sleep(3000 * (attempt + 1), signal);
        continue;
      }
      throw new ScanError("network", "Koneksi terputus. Periksa internet kamu lalu lanjutkan.");
    }
  }
}

function appendUnique(existing: IgUser[], incoming: IgUser[]): IgUser[] {
  const seen = new Set(existing.map((u) => u.id ?? u.username));
  const merged = existing.slice();
  for (const user of incoming) {
    const key = user.id ?? user.username;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(user);
    }
  }
  return merged;
}

/**
 * Ambil followers lalu following, halaman demi halaman, dengan jeda acak
 * antar request agar tidak memicu pembatasan Instagram.
 * Bisa dilanjutkan: lempar error → `onUpdate` terakhir menyimpan progres.
 */
export async function runScan(
  initial: ScanState,
  onUpdate: (state: ScanState) => void,
  signal: AbortSignal,
  /** Dipanggil dengan lama jeda (ms) sebelum menunggu, dan `null` setelahnya. */
  onWait?: (ms: number | null) => void,
): Promise<ScanState> {
  let state = initial;

  for (const type of ["followers", "following"] as const) {
    let progress = state[type];
    let pages = 0;

    while (!progress.done) {
      const page = await fetchPage(type, progress.cursor, signal);
      if (signal.aborted) throw abortError();

      pages++;
      const stuck = page.nextCursor !== null && page.nextCursor === progress.cursor;
      const done = page.nextCursor === null || stuck || pages >= MAX_PAGES_PER_LIST;
      progress = {
        users: appendUnique(progress.users, page.users),
        cursor: page.nextCursor,
        done,
      };
      state = { ...state, [type]: progress };
      onUpdate(state);

      if (!done) await wait(delayAfterPage(pages), signal, onWait);
    }
    if (type === "followers") await wait(5000, signal, onWait);
  }
  return state;
}
