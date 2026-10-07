import type { IgUser } from "./types";
import { dedupe } from "./compare";

/**
 * Parser untuk fitur resmi Instagram "Unduh informasi Anda" (format JSON).
 *
 *  - followers_1.json, followers_2.json, ... → array of { string_list_data: [...] }
 *  - following.json → { relationships_following: [ { title, string_list_data: [...] } ] }
 */

interface StringListItem {
  href?: unknown;
  value?: unknown;
}
interface Entry {
  title?: unknown;
  string_list_data?: unknown;
}

const USERNAME_RE = /^[A-Za-z0-9._]{1,30}$/;

function usernameFromHref(href: string): string | undefined {
  const match = href.match(/instagram\.com\/(?:_u\/)?([A-Za-z0-9._]+)\/?(?:[?#].*)?$/);
  return match?.[1];
}

function entryToUser(entry: Entry): IgUser | null {
  const item = Array.isArray(entry.string_list_data)
    ? (entry.string_list_data[0] as StringListItem | undefined)
    : undefined;

  const candidates: unknown[] = [
    item?.value,
    entry.title,
    typeof item?.href === "string" ? usernameFromHref(item.href) : undefined,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && USERNAME_RE.test(c.trim())) {
      return { username: c.trim() };
    }
  }
  return null;
}

function entriesOf(json: unknown): Entry[] {
  if (Array.isArray(json)) return json as Entry[];
  if (json && typeof json === "object") {
    const obj = json as Record<string, unknown>;
    for (const key of ["relationships_following", "relationships_followers"]) {
      if (Array.isArray(obj[key])) return obj[key] as Entry[];
    }
  }
  return [];
}

export function parseExportJson(json: unknown): IgUser[] {
  const users: IgUser[] = [];
  for (const entry of entriesOf(json)) {
    if (!entry || typeof entry !== "object") continue;
    const user = entryToUser(entry);
    if (user) users.push(user);
  }
  return users;
}

export type ExportKind = "followers" | "following";

/** Tentukan jenis file dari namanya, mis. `connections/.../followers_1.json`. */
export function classifyExportFile(path: string): ExportKind | null {
  const name = path.split("/").pop()?.toLowerCase() ?? "";
  if (/^followers(_\d+)?\.json$/.test(name)) return "followers";
  if (/^following\.json$/.test(name)) return "following";
  return null;
}

export interface ParsedExport {
  followers: IgUser[];
  following: IgUser[];
}

/** Gabungkan banyak file (hasil `classifyExportFile` + isi JSON-nya). */
export function mergeExportFiles(files: { path: string; json: unknown }[]): ParsedExport {
  const followers: IgUser[] = [];
  const following: IgUser[] = [];
  for (const { path, json } of files) {
    const kind = classifyExportFile(path);
    if (kind === "followers") followers.push(...parseExportJson(json));
    else if (kind === "following") following.push(...parseExportJson(json));
  }
  return { followers: dedupe(followers), following: dedupe(following) };
}
