import { describe, expect, it } from "vitest";
import { compare, dedupe, diffSnapshots } from "@/lib/compare";

const u = (username: string) => ({ username });

describe("compare", () => {
  const followers = ["alice", "Bob", "carol", "dave"].map(u);
  const following = ["alice", "bob", "erin", "frank"].map(u);
  const result = compare(followers, following);

  it("menemukan akun yang tidak follow balik", () => {
    expect(result.notFollowingBack.map((x) => x.username)).toEqual(["erin", "frank"]);
  });
  it("menemukan followers yang belum di-follow balik", () => {
    expect(result.notFollowedByYou.map((x) => x.username)).toEqual(["carol", "dave"]);
  });
  it("menemukan akun yang saling follow (tanpa membedakan huruf besar/kecil)", () => {
    expect(result.mutuals.map((x) => x.username.toLowerCase())).toEqual(["alice", "bob"]);
  });
  it("menangani daftar kosong", () => {
    const empty = compare([], []);
    expect(empty.notFollowingBack).toEqual([]);
    expect(empty.mutuals).toEqual([]);
  });
});

describe("dedupe", () => {
  it("menghapus duplikat dan mempertahankan entri dengan foto profil", () => {
    const out = dedupe([{ username: "Alice" }, { username: "alice", profilePicUrl: "x" }, { username: "" }]);
    expect(out).toHaveLength(1);
    expect(out[0].profilePicUrl).toBe("x");
  });
});

describe("diffSnapshots", () => {
  it("mendeteksi unfollow dan follower baru", () => {
    const diff = diffSnapshots(
      { followers: ["a", "b", "c"], following: ["a", "x"] },
      { followers: ["a", "c", "d"], following: ["a", "y"] },
    );
    expect(diff.lostFollowers).toEqual(["b"]);
    expect(diff.newFollowers).toEqual(["d"]);
    expect(diff.unfollowedByYou).toEqual(["x"]);
    expect(diff.newlyFollowedByYou).toEqual(["y"]);
  });
});
