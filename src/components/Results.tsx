"use client";

import { useEffect, useMemo, useState } from "react";
import { compare, diffSnapshots, normalizeUsername } from "@/lib/compare";
import { downloadCsv } from "@/lib/csv";
import { loadSnapshot, saveSnapshot } from "@/lib/snapshot";
import type { IgUser } from "@/lib/types";
import { UserList } from "./UserList";

interface Props {
  /** Kunci riwayat snapshot di localStorage (username akun, atau "export"). */
  accountKey: string;
  label: string;
  followers: IgUser[];
  following: IgUser[];
}

type TabId = "notFollowingBack" | "notFollowedByYou" | "mutuals" | "followers" | "following";

const nf = new Intl.NumberFormat("id-ID");

const TABS: { id: TabId; title: string; hint: string; empty: string; file: string }[] = [
  {
    id: "notFollowingBack",
    title: "Tidak follow balik",
    hint: "Kamu follow, mereka tidak",
    empty: "Semua akun yang kamu follow juga follow kamu. 🎉",
    file: "tidak-follow-balik",
  },
  {
    id: "notFollowedByYou",
    title: "Belum kamu follow balik",
    hint: "Mereka follow, kamu tidak",
    empty: "Kamu sudah follow balik semua followers.",
    file: "belum-di-follow-balik",
  },
  { id: "mutuals", title: "Saling follow", hint: "Saling mengikuti", empty: "Belum ada akun yang saling follow.", file: "saling-follow" },
  { id: "followers", title: "Followers", hint: "Semua pengikut", empty: "Tidak ada followers.", file: "followers" },
  { id: "following", title: "Following", hint: "Semua yang kamu ikuti", empty: "Tidak ada following.", file: "following" },
];

export function Results({ accountKey, label, followers, following }: Props) {
  const data = useMemo(() => compare(followers, following), [followers, following]);
  const [tab, setTab] = useState<TabId>("notFollowingBack");
  const [query, setQuery] = useState("");

  // Snapshot sebelumnya dibaca sekali, lalu diganti dengan hasil scan ini.
  const [previous] = useState(() => (typeof window === "undefined" ? null : loadSnapshot(accountKey)));
  useEffect(() => {
    saveSnapshot(accountKey, {
      takenAt: new Date().toISOString(),
      followers: data.followers.map((u) => u.username),
      following: data.following.map((u) => u.username),
    });
  }, [accountKey, data]);

  const diff = useMemo(
    () =>
      previous
        ? diffSnapshots(previous, {
            followers: data.followers.map((u) => u.username),
            following: data.following.map((u) => u.username),
          })
        : null,
    [previous, data],
  );

  const active = TABS.find((t) => t.id === tab)!;
  const list = data[tab];
  const filtered = useMemo(() => {
    const q = normalizeUsername(query);
    if (!q) return list;
    return list.filter(
      (u) => normalizeUsername(u.username).includes(q) || (u.fullName ?? "").toLowerCase().includes(q),
    );
  }, [list, query]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Hasil untuk {label}</h2>
        <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
          Pilih kartu di bawah untuk melihat daftarnya.
        </p>
      </div>

      <div role="tablist" aria-label="Daftar" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {TABS.map((t) => {
          const selected = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="result-panel"
              onClick={() => {
                setTab(t.id);
                setQuery("");
              }}
              className={`card p-3.5 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-500 ${
                selected
                  ? "!border-fuchsia-500 ring-2 ring-fuchsia-500/20"
                  : "hover:border-slate-300 dark:hover:border-slate-700"
              }`}
            >
              <span className="block text-2xl font-bold tabular-nums">{nf.format(data[t.id].length)}</span>
              <span className="mt-0.5 block text-sm font-medium leading-snug">{t.title}</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">{t.hint}</span>
            </button>
          );
        })}
      </div>

      {diff && previous && <DiffPanel diff={diff} since={previous.takenAt} />}

      <section id="result-panel" role="tabpanel" className="card overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-slate-100 p-3 sm:flex-row sm:items-center dark:border-slate-800">
          <input
            type="search"
            className="input sm:max-w-xs"
            placeholder="Cari username atau nama…"
            aria-label="Cari"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <p className="text-sm text-slate-500 sm:ml-auto" aria-live="polite">
            {query ? `${nf.format(filtered.length)} dari ${nf.format(list.length)}` : `${nf.format(list.length)} akun`}
          </p>
          <button
            type="button"
            className="btn-ghost"
            disabled={filtered.length === 0}
            onClick={() => downloadCsv(`${active.file}.csv`, filtered)}
          >
            Unduh CSV
          </button>
        </div>
        {/* key: reset jumlah baris yang ditampilkan saat tab/pencarian berubah */}
        <UserList key={`${tab}:${query}`} users={filtered} emptyText={query ? "Tidak ada yang cocok." : active.empty} />
      </section>
    </div>
  );
}

function DiffPanel({ diff, since }: { diff: ReturnType<typeof diffSnapshots>; since: string }) {
  const date = new Date(since).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
  const groups = [
    { title: "Berhenti follow kamu", names: diff.lostFollowers, tone: "text-red-600 dark:text-red-400" },
    { title: "Follower baru", names: diff.newFollowers, tone: "text-emerald-600 dark:text-emerald-400" },
    { title: "Kamu berhenti follow", names: diff.unfollowedByYou, tone: "text-slate-600 dark:text-slate-300" },
    { title: "Kamu follow baru", names: diff.newlyFollowedByYou, tone: "text-slate-600 dark:text-slate-300" },
  ].filter((g) => g.names.length > 0);

  return (
    <section className="card p-4" aria-labelledby="diff-title">
      <h3 id="diff-title" className="text-sm font-semibold">
        Perubahan sejak scan terakhir <span className="font-normal text-slate-500">({date})</span>
      </h3>
      {groups.length === 0 ? (
        <p className="mt-1 text-sm text-slate-500">Tidak ada perubahan.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {groups.map((g) => (
            <div key={g.title}>
              <p className={`text-xs font-semibold uppercase tracking-wide ${g.tone}`}>
                {g.title} · {nf.format(g.names.length)}
              </p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {g.names.slice(0, 60).map((name) => (
                  <li key={name}>
                    <a
                      href={`https://www.instagram.com/${encodeURIComponent(name)}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full bg-slate-100 px-2.5 py-1 text-xs hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
                    >
                      {name}
                    </a>
                  </li>
                ))}
                {g.names.length > 60 && <li className="px-1 py-1 text-xs text-slate-500">+{g.names.length - 60} lainnya</li>}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
