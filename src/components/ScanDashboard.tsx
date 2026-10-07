"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { emptyScan, runScan, ScanError, type ListProgress, type ScanState } from "@/lib/scan";
import type { ProfileInfo, SessionUser } from "@/lib/types";
import { Results } from "./Results";

interface Props {
  user: SessionUser;
  onSessionExpired: () => void;
}

type Status = "running" | "paused" | "error" | "done";

const nf = new Intl.NumberFormat("id-ID");

export function ScanDashboard({ user, onSessionExpired }: Props) {
  const [scan, setScan] = useState<ScanState>(emptyScan);
  const [status, setStatus] = useState<Status>("running");
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [waitMs, setWaitMs] = useState<number | null>(null);
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const latest = useRef<ScanState>(scan);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("running");
    setError(null);
    try {
      await runScan(
        latest.current,
        (state) => {
          latest.current = state;
          setScan(state);
        },
        controller.signal,
        setWaitMs,
      );
      setStatus("done");
    } catch (e) {
      if (controller.signal.aborted) return;
      const code = e instanceof ScanError ? e.code : "unknown";
      const fetched = latest.current.followers.users.length + latest.current.following.users.length;

      // Cookie sesi di aplikasi hilang, atau Instagram menolak sesi sejak request pertama.
      if (code === "not_logged_in" || (code === "session_expired" && fetched === 0)) {
        onSessionExpired();
        return;
      }
      // Instagram menolak di tengah scan: simpan progres & sesi, beri kesempatan lanjut.
      if (code === "session_expired") {
        setError({
          code,
          message: `Instagram menolak permintaan di tengah scan (${nf.format(fetched)} akun sudah terambil). Biasanya ini pembatasan sementara. Tunggu 5–10 menit (jangan muat ulang halaman, progres akan hilang), lalu klik "Lanjutkan scan". Jika ditolak lagi, login ulang atau pakai Upload data export.`,
        });
      } else {
        setError({ code, message: e instanceof Error ? e.message : "Terjadi kesalahan." });
      }
      setStatus("error");
    }
  }, [onSessionExpired]);

  useEffect(() => {
    void start();
    return () => abortRef.current?.abort();
  }, [start]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ig/profile", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.profile) setProfile(data.profile as ProfileInfo);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "done") {
    return (
      <Results
        accountKey={user.username}
        label={`@${user.username}`}
        followers={scan.followers.users}
        following={scan.following.users}
      />
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="card p-5 sm:p-6">
        <h2 className="text-lg font-semibold">
          {status === "running" ? "Mengambil data akun…" : status === "paused" ? "Scan dihentikan" : "Scan terhenti"}
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {status === "running"
            ? "Jangan tutup tab ini. Akun dengan ribuan followers bisa memakan waktu beberapa menit karena kami sengaja memberi jeda (dan istirahat berkala) agar Instagram tidak membatasi akunmu."
            : "Progres tersimpan — kamu bisa melanjutkan dari titik terakhir."}
        </p>

        <div className="mt-5 space-y-4" aria-live="polite">
          <ProgressRow label="Followers" progress={scan.followers} total={profile?.followerCount} />
          <ProgressRow label="Following" progress={scan.following} total={profile?.followingCount} />
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
            {error.message}
          </p>
        )}
        {status === "running" && waitMs !== null && waitMs >= 10_000 && (
          <p className="mt-4 text-xs text-slate-500" role="status">
            Istirahat sebentar (±{Math.round(waitMs / 1000)} dtk) supaya tidak dibatasi Instagram…
          </p>
        )}

        <div className="mt-5 flex gap-2">
          {status === "running" ? (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                abortRef.current?.abort();
                setStatus("paused");
              }}
            >
              Hentikan
            </button>
          ) : (
            <>
              <button type="button" className="btn-primary" onClick={() => void start()}>
                Lanjutkan scan
              </button>
              {error?.code === "session_expired" && (
                <button type="button" className="btn-ghost" onClick={onSessionExpired}>
                  Login ulang
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ProgressRow({ label, progress, total }: { label: string; progress: ListProgress; total?: number }) {
  const count = progress.users.length;
  const pct = progress.done ? 100 : total ? Math.min(99, Math.round((count / total) * 100)) : null;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-slate-600 dark:text-slate-400">
          {nf.format(count)}
          {total ? ` / ${nf.format(total)}` : ""}
          {progress.done ? " ✓" : ""}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? undefined}
      >
        <div
          className={`h-full rounded-full bg-gradient-to-r from-fuchsia-600 to-orange-500 transition-all ${
            pct === null && count > 0 ? "w-1/3 animate-pulse" : ""
          }`}
          style={pct !== null ? { width: `${pct}%` } : undefined}
        />
      </div>
    </div>
  );
}
