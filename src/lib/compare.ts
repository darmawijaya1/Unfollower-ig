import type { IgUser } from "./types";

export interface Comparison {
  followers: IgUser[];
  following: IgUser[];
  /** Kamu follow mereka, tetapi mereka tidak follow kamu. */
  notFollowingBack: IgUser[];
  /** Mereka follow kamu, tetapi kamu tidak follow mereka. */
  notFollowedByYou: IgUser[];
  /** Saling follow. */
  mutuals: IgUser[];
}

export const normalizeUsername = (username: string): string =>
  username.trim().replace(/^@/, "").toLowerCase();

/** Hapus duplikat berdasarkan username (huruf besar/kecil tidak dibedakan). */
export function dedupe(users: IgUser[]): IgUser[] {
  const seen = new Map<string, IgUser>();
  for (const user of users) {
    const key = normalizeUsername(user.username);
    if (!key) continue;
    const existing = seen.get(key);
    // Pertahankan entri yang datanya lebih lengkap.
    if (!existing || (!existing.profilePicUrl && user.profilePicUrl)) {
      seen.set(key, user);
    }
  }
  return [...seen.values()];
}

const byUsername = (a: IgUser, b: IgUser) =>
  a.username.localeCompare(b.username, undefined, { sensitivity: "base" });

export function compare(followersRaw: IgUser[], followingRaw: IgUser[]): Comparison {
  const followers = dedupe(followersRaw);
  const following = dedupe(followingRaw);

  const followerKeys = new Set(followers.map((u) => normalizeUsername(u.username)));
  const followingKeys = new Set(following.map((u) => normalizeUsername(u.username)));

  const notFollowingBack = following.filter((u) => !followerKeys.has(normalizeUsername(u.username)));
  const notFollowedByYou = followers.filter((u) => !followingKeys.has(normalizeUsername(u.username)));
  const mutuals = following.filter((u) => followerKeys.has(normalizeUsername(u.username)));

  return {
    followers: followers.sort(byUsername),
    following: following.sort(byUsername),
    notFollowingBack: notFollowingBack.sort(byUsername),
    notFollowedByYou: notFollowedByYou.sort(byUsername),
    mutuals: mutuals.sort(byUsername),
  };
}

export interface SnapshotDiff {
  /** Ada di scan sebelumnya, hilang sekarang (unfollow / akun dihapus / ganti username). */
  lostFollowers: string[];
  newFollowers: string[];
  /** Kamu berhenti follow orang ini sejak scan sebelumnya. */
  unfollowedByYou: string[];
  newlyFollowedByYou: string[];
}

const setDiff = (a: Set<string>, b: Set<string>): string[] =>
  [...a].filter((x) => !b.has(x)).sort((x, y) => x.localeCompare(y));

export function diffSnapshots(
  prev: { followers: string[]; following: string[] },
  next: { followers: string[]; following: string[] },
): SnapshotDiff {
  const pf = new Set(prev.followers.map(normalizeUsername));
  const nf = new Set(next.followers.map(normalizeUsername));
  const pg = new Set(prev.following.map(normalizeUsername));
  const ng = new Set(next.following.map(normalizeUsername));
  return {
    lostFollowers: setDiff(pf, nf),
    newFollowers: setDiff(nf, pf),
    unfollowedByYou: setDiff(pg, ng),
    newlyFollowedByYou: setDiff(ng, pg),
  };
}
