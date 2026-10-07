import { describe, expect, it } from "vitest";
import { classifyExportFile, mergeExportFiles, parseExportJson } from "@/lib/export-parser";

describe("parseExportJson", () => {
  it("membaca format followers_1.json (array, username di value)", () => {
    const json = [
      { title: "", media_list_data: [], string_list_data: [{ href: "https://www.instagram.com/alice", value: "alice", timestamp: 1 }] },
      { title: "", string_list_data: [{ href: "https://www.instagram.com/bob.b", value: "bob.b", timestamp: 2 }] },
    ];
    expect(parseExportJson(json).map((x) => x.username)).toEqual(["alice", "bob.b"]);
  });

  it("membaca format following.json (username di title, href memakai /_u/)", () => {
    const json = {
      relationships_following: [
        { title: "carol_99", string_list_data: [{ href: "https://www.instagram.com/_u/carol_99", timestamp: 3 }] },
      ],
    };
    expect(parseExportJson(json).map((x) => x.username)).toEqual(["carol_99"]);
  });

  it("jatuh ke href jika value dan title kosong", () => {
    const json = [{ title: "", string_list_data: [{ href: "https://www.instagram.com/_u/dave" }] }];
    expect(parseExportJson(json).map((x) => x.username)).toEqual(["dave"]);
  });

  it("mengabaikan entri rusak tanpa melempar error", () => {
    expect(parseExportJson([null, 1, {}, { string_list_data: [] }, { title: "bad name!" }])).toEqual([]);
    expect(parseExportJson("nonsense")).toEqual([]);
  });
});

describe("classifyExportFile", () => {
  it("mengenali nama file export", () => {
    expect(classifyExportFile("connections/followers_and_following/followers_1.json")).toBe("followers");
    expect(classifyExportFile("followers_12.json")).toBe("followers");
    expect(classifyExportFile("a/b/following.json")).toBe("following");
    expect(classifyExportFile("a/b/following_hashtags.json")).toBeNull();
    expect(classifyExportFile("a/b/recently_unfollowed_profiles.json")).toBeNull();
  });
});

describe("mergeExportFiles", () => {
  it("menggabungkan beberapa file followers dan menghapus duplikat", () => {
    const entry = (name: string) => ({ string_list_data: [{ value: name }] });
    const out = mergeExportFiles([
      { path: "followers_1.json", json: [entry("a"), entry("b")] },
      { path: "followers_2.json", json: [entry("b"), entry("c")] },
      { path: "following.json", json: { relationships_following: [{ title: "a", string_list_data: [] }] } },
      { path: "other.json", json: [entry("zzz")] },
    ]);
    expect(out.followers.map((x) => x.username)).toEqual(["a", "b", "c"]);
    expect(out.following.map((x) => x.username)).toEqual(["a"]);
  });
});
