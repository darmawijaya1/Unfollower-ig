/**
 * Menyimpan hasil scan terakhir di localStorage (hanya di browser kamu)
 * supaya bisa dibandingkan: siapa yang baru unfollow sejak terakhir cek.
 */

export interface Snapshot {
  takenAt: string;
  followers: string[];
  following: string[];
}

const key = (account: string) => `unfollower-ig:snapshot:v1:${account.toLowerCase()}`;

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

export function loadSnapshot(account: string): Snapshot | null {
  try {
    const raw = window.localStorage.getItem(key(account));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Snapshot>;
    if (typeof parsed.takenAt === "string" && isStringArray(parsed.followers) && isStringArray(parsed.following)) {
      return parsed as Snapshot;
    }
  } catch {
    // localStorage tidak tersedia / data rusak — abaikan.
  }
  return null;
}

export function saveSnapshot(account: string, snapshot: Snapshot): void {
  try {
    window.localStorage.setItem(key(account), JSON.stringify(snapshot));
  } catch {
    // Penyimpanan penuh atau diblokir — fitur riwayat saja yang hilang.
  }
}

export function clearSnapshot(account: string): void {
  try {
    window.localStorage.removeItem(key(account));
  } catch {
    // abaikan
  }
}
