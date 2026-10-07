import { describe, expect, it } from "vitest";
import { usersToCsv } from "@/lib/csv";

describe("usersToCsv", () => {
  it("menulis header, quoting, dan url profil", () => {
    const csv = usersToCsv([{ username: "alice", fullName: 'Alice "A" Smith' }]);
    expect(csv.split("\r\n")).toEqual([
      "username,nama,url_profil",
      '"alice","Alice ""A"" Smith","https://www.instagram.com/alice/"',
    ]);
  });

  it("menetralkan formula injection", () => {
    const csv = usersToCsv([{ username: "x", fullName: "=HYPERLINK(\"http://evil\")" }]);
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
  });
});
