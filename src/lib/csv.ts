import type { IgUser } from "./types";

/** Cegah CSV/formula injection di Excel/Sheets untuk sel yang diawali = + - @ */
function cell(value: string): string {
  let v = value;
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return `"${v.replace(/"/g, '""')}"`;
}

export function usersToCsv(users: IgUser[]): string {
  const header = ["username", "nama", "url_profil"].join(",");
  const rows = users.map((u) =>
    [cell(u.username), cell(u.fullName ?? ""), cell(`https://www.instagram.com/${u.username}/`)].join(","),
  );
  return [header, ...rows].join("\r\n");
}

export function downloadCsv(filename: string, users: IgUser[]): void {
  // BOM supaya Excel membaca UTF-8 dengan benar.
  const blob = new Blob(["﻿", usersToCsv(users)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
