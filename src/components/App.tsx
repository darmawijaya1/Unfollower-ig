"use client";

import { useCallback, useEffect, useState } from "react";
import type { IgUser, SessionUser } from "@/lib/types";
import { AuthPanel } from "./AuthPanel";
import { Results } from "./Results";
import { ScanDashboard } from "./ScanDashboard";

type Source =
  | { kind: "instagram"; user: SessionUser }
  | { kind: "export"; followers: IgUser[]; following: IgUser[] };

export function App() {
  const [source, setSource] = useState<Source | null>(null);
  const [checking, setChecking] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.user) setSource({ kind: "instagram", user: data.user as SessionUser });
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const logout = useCallback(async (message?: string) => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setNotice(message ?? null);
    setSource(null);
  }, []);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 pb-16 sm:px-6">
      <header className="flex items-center justify-between gap-3 py-5">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-600 to-orange-500 text-white shadow-sm"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="m17 8 5 5m0-5-5 5" />
            </svg>
          </span>
          <div className="leading-tight">
            <h1 className="text-base font-bold">Unfollower</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Cek siapa yang tidak follow balik</p>
          </div>
        </div>

        {source && (
          <div className="flex items-center gap-2">
            {source.kind === "instagram" && (
              <span className="hidden text-sm font-medium sm:inline">@{source.user.username}</span>
            )}
            <button type="button" className="btn-ghost" onClick={() => logout()}>
              {source.kind === "instagram" ? "Keluar" : "Ganti sumber data"}
            </button>
          </div>
        )}
      </header>

      <main className="flex-1">
        {checking ? (
          <p className="py-24 text-center text-sm text-slate-500" role="status">
            Memuat…
          </p>
        ) : !source ? (
          <AuthPanel
            notice={notice}
            onLoggedIn={(user) => {
              setNotice(null);
              setSource({ kind: "instagram", user });
            }}
            onExportLoaded={(data) => {
              setNotice(null);
              setSource({ kind: "export", ...data });
            }}
          />
        ) : source.kind === "instagram" ? (
          <ScanDashboard
            key={source.user.userId}
            user={source.user}
            onSessionExpired={() => logout("Sesi Instagram berakhir. Silakan login ulang.")}
          />
        ) : (
          <Results
            accountKey="export"
            label="Data export Instagram"
            followers={source.followers}
            following={source.following}
          />
        )}
      </main>

      <footer className="mt-12 text-center text-xs text-slate-500 dark:text-slate-400">
        Tidak berafiliasi dengan Instagram/Meta. Password tidak pernah disimpan di server.
      </footer>
    </div>
  );
}
