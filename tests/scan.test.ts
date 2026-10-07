import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { delayAfterPage, emptyScan, REST_EVERY_PAGES, runScan, ScanError, type ScanState } from "@/lib/scan";

describe("delayAfterPage", () => {
  it("jeda biasa 3–6 detik", () => {
    expect(delayAfterPage(1, () => 0)).toBe(3_000);
    expect(delayAfterPage(1, () => 0.999)).toBeLessThan(6_000);
    expect(delayAfterPage(REST_EVERY_PAGES - 1, () => 0.5)).toBe(4_500);
  });

  it("istirahat panjang 20–30 detik setiap kelipatan REST_EVERY_PAGES halaman", () => {
    expect(delayAfterPage(REST_EVERY_PAGES, () => 0)).toBe(20_000);
    expect(delayAfterPage(REST_EVERY_PAGES * 2, () => 0.999)).toBeLessThan(30_000);
    expect(delayAfterPage(REST_EVERY_PAGES * 2, () => 0.999)).toBeGreaterThan(29_000);
  });
});

type Page = { users: { username: string; id: string }[]; nextCursor: string | null };
const u = (name: string) => ({ username: name, id: name });

/** Tabel halaman palsu: key = `${type}:${cursor ?? ""}`. */
const PAGES: Record<string, Page> = {
  "followers:": { users: [u("a1"), u("a2")], nextCursor: "c1" },
  "followers:c1": { users: [u("a3")], nextCursor: null },
  "following:": { users: [u("b1")], nextCursor: null },
};

function mockApi(opts: { rejectOnce?: string } = {}) {
  let rejected = false;
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const url = new URL(input, "http://localhost");
      const key = `${url.searchParams.get("type")}:${url.searchParams.get("cursor") ?? ""}`;
      calls.push(key);
      if (opts.rejectOnce === key && !rejected) {
        rejected = true;
        return new Response(JSON.stringify({ status: "error", code: "session_expired", message: "ditolak" }), { status: 401 });
      }
      return new Response(JSON.stringify({ status: "ok", ...PAGES[key] }), { status: 200 });
    }),
  );
  return calls;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("runScan", () => {
  it("mengambil followers lalu following sampai selesai", async () => {
    mockApi();
    const done = runScan(emptyScan(), () => undefined, new AbortController().signal);
    await vi.runAllTimersAsync();
    const state = await done;
    expect(state.followers.users.map((x) => x.username)).toEqual(["a1", "a2", "a3"]);
    expect(state.following.users.map((x) => x.username)).toEqual(["b1"]);
    expect(state.followers.done && state.following.done).toBe(true);
  });

  it("jika Instagram menolak di tengah jalan: progres tersimpan dan bisa dilanjutkan tanpa duplikat", async () => {
    const calls = mockApi({ rejectOnce: "followers:c1" });
    let latest: ScanState = emptyScan();
    const onUpdate = (s: ScanState) => (latest = s);

    const first = runScan(latest, onUpdate, new AbortController().signal).then(
      () => null,
      (e: unknown) => e,
    );
    await vi.runAllTimersAsync();
    const error = (await first) as ScanError;
    expect(error).toBeInstanceOf(ScanError);
    expect(error.code).toBe("session_expired");
    // Halaman pertama sudah tersimpan, kursor menunjuk halaman yang gagal.
    expect(latest.followers.users.map((x) => x.username)).toEqual(["a1", "a2"]);
    expect(latest.followers.cursor).toBe("c1");
    expect(latest.followers.done).toBe(false);

    const second = runScan(latest, onUpdate, new AbortController().signal);
    await vi.runAllTimersAsync();
    const state = await second;
    expect(state.followers.users.map((x) => x.username)).toEqual(["a1", "a2", "a3"]);
    expect(state.following.users.map((x) => x.username)).toEqual(["b1"]);
    // Halaman pertama followers tidak diminta ulang saat dilanjutkan.
    expect(calls.filter((c) => c === "followers:")).toHaveLength(1);
  });

  it("melaporkan lama jeda lewat onWait dan membersihkannya", async () => {
    mockApi();
    const waits: (number | null)[] = [];
    const done = runScan(emptyScan(), () => undefined, new AbortController().signal, (ms) => waits.push(ms));
    await vi.runAllTimersAsync();
    await done;
    expect(waits.length).toBeGreaterThan(0);
    expect(waits.at(-1)).toBeNull();
    expect(waits.filter((w) => w !== null).every((w) => (w as number) >= 3_000)).toBe(true);
  });

  it("abort saat jeda langsung menghentikan scan tanpa menunggu timer, dan membersihkan onWait", async () => {
    mockApi();
    const controller = new AbortController();
    const waits: (number | null)[] = [];
    const run = runScan(emptyScan(), () => undefined, controller.signal, (ms) => waits.push(ms)).then(
      () => "selesai",
      (e: unknown) => (e as Error).name,
    );
    // Maju sedikit saja: halaman pertama terambil dan scan sedang menunggu jeda 3–6 dtk.
    await vi.advanceTimersByTimeAsync(100);
    expect(waits.at(-1)).toBeGreaterThanOrEqual(3_000);
    controller.abort();
    // Timer TIDAK dimajukan: jika listener abort di sleep() hilang, `run` menggantung (tes timeout).
    expect(await run).toBe("AbortError");
    expect(waits.at(-1)).toBeNull();
  });
});
