"use client";

import { useRef, useState } from "react";
import { loadExportFiles } from "@/lib/export-loader";
import type { IgUser, LoginResponse, SessionUser } from "@/lib/types";

interface Props {
  notice: string | null;
  onLoggedIn: (user: SessionUser) => void;
  onExportLoaded: (data: { followers: IgUser[]; following: IgUser[] }) => void;
}

type Tab = "login" | "export";

export function AuthPanel({ notice, onLoggedIn, onExportLoaded }: Props) {
  const [tab, setTab] = useState<Tab>("login");

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-bold tracking-tight">Cek followers Instagram kamu</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Lihat siapa saja yang kamu follow tetapi tidak follow balik — dan sebaliknya.
        </p>
      </div>

      {notice && (
        <p role="status" className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
          {notice}
        </p>
      )}

      <div className="card p-5 sm:p-6">
        <div role="tablist" aria-label="Sumber data" className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          {(
            [
              ["login", "Login Instagram"],
              ["export", "Upload data export"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`panel-${id}`}
              onClick={() => setTab(id)}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                tab === id
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div role="tabpanel" id="panel-login" aria-labelledby="tab-login" hidden={tab !== "login"}>
          <LoginForm onLoggedIn={onLoggedIn} />
        </div>
        <div role="tabpanel" id="panel-export" aria-labelledby="tab-export" hidden={tab !== "export"}>
          <ExportUpload onLoaded={onExportLoaded} />
        </div>
      </div>
    </div>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
      {children}
    </p>
  );
}

function LoginForm({ onLoggedIn }: { onLoggedIn: (user: SessionUser) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [twoFactor, setTwoFactor] = useState<{ method: string; phoneHint?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function post(url: string, body: object): Promise<LoginResponse> {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return (await res.json()) as LoginResponse;
    } catch {
      return { status: "error", code: "unknown", message: "Tidak dapat menghubungi server. Coba lagi." };
    }
  }

  async function handle(result: LoginResponse) {
    if (result.status === "ok") {
      setPassword("");
      onLoggedIn(result.user);
    } else if (result.status === "two_factor") {
      setTwoFactor({ method: result.method, phoneHint: result.phoneHint });
      setError(null);
    } else {
      setError(result.message);
    }
  }

  async function submitCredentials(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    await handle(await post("/api/auth/login", { username, password }));
    setBusy(false);
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await post("/api/auth/two-factor", { code });
    if (result.status === "ok") setCode("");
    await handle(result);
    setBusy(false);
  }

  if (twoFactor) {
    return (
      <form onSubmit={submitCode} className="space-y-4">
        <div>
          <h3 className="font-semibold">Verifikasi dua langkah</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {twoFactor.method === "sms"
              ? `Masukkan kode yang dikirim lewat SMS${twoFactor.phoneHint ? ` ke ${twoFactor.phoneHint}` : ""}.`
              : "Masukkan kode dari aplikasi autentikator kamu (atau kode cadangan)."}
          </p>
        </div>
        <div>
          <label htmlFor="code" className="mb-1 block text-sm font-medium">
            Kode verifikasi
          </label>
          <input
            id="code"
            className="input tracking-widest"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={9}
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        {error && <ErrorText>{error}</ErrorText>}
        <div className="flex gap-2">
          <button type="submit" className="btn-primary flex-1" disabled={busy || code.replace(/\s/g, "").length < 6}>
            {busy ? "Memverifikasi…" : "Verifikasi"}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setTwoFactor(null);
              setCode("");
              setError(null);
            }}
          >
            Kembali
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={submitCredentials} className="space-y-4">
      <div>
        <label htmlFor="username" className="mb-1 block text-sm font-medium">
          Username / email
        </label>
        <input
          id="username"
          className="input"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          type="password"
          className="input"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      {error && <ErrorText>{error}</ErrorText>}

      <button type="submit" className="btn-primary w-full" disabled={busy || !username || !password}>
        {busy ? "Masuk…" : "Login & mulai scan"}
      </button>

      <details className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-400">
        <summary className="cursor-pointer font-medium text-slate-700 dark:text-slate-300">Baca dulu: keamanan & batasan</summary>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>Password hanya diteruskan ke Instagram saat login dan tidak disimpan. Sesi disimpan di cookie terenkripsi di browser kamu.</li>
          <li>
            Instagram tidak punya API resmi untuk ini, jadi aplikasi memakai endpoint web tidak resmi. Secara teknis ini melanggar
            ketentuan Instagram dan, pada kasus jarang, akunmu bisa dibatasi sementara. Gunakan seperlunya.
          </li>
          <li>
            Login dari server cloud sering memicu verifikasi keamanan. Jika gagal, pakai tab <strong>Upload data export</strong> —
            lebih aman dan selalu berhasil.
          </li>
        </ul>
      </details>
    </form>
  );
}

function ExportUpload({ onLoaded }: { onLoaded: (data: { followers: IgUser[]; following: IgUser[] }) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(list: FileList | File[]) {
    const files = Array.from(list);
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      onLoaded(await loadExportFiles(files));
    } catch (e) {
      setError(
        e instanceof SyntaxError
          ? "Isi file bukan JSON yang valid. Pastikan kamu memilih format JSON saat mengunduh data."
          : e instanceof Error
            ? e.message
            : "Gagal membaca file.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Cara paling aman: tanpa memasukkan password. File dibaca langsung di browser kamu dan tidak diunggah ke server mana pun.
      </p>

      <details className="rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60">
        <summary className="cursor-pointer font-medium">Cara mengunduh data dari Instagram</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-600 dark:text-slate-400">
          <li>Buka Instagram → <em>Pengaturan</em> → <em>Pusat Akun</em> → <em>Informasi dan izin kamu</em> → <em>Unduh informasi kamu</em>.</li>
          <li>Pilih <em>Unduh atau transfer informasi</em> → pilih akunmu → <em>Sebagian informasi</em>.</li>
          <li>Centang <strong>Pengikut dan yang diikuti</strong> (Followers and following).</li>
          <li>Pilih <em>Unduh ke perangkat</em>, rentang tanggal <strong>Sepanjang waktu</strong>, format <strong>JSON</strong>.</li>
          <li>Tunggu emailnya (beberapa menit sampai beberapa jam), unduh file ZIP, lalu upload di sini.</li>
        </ol>
        <p className="mt-2 text-xs text-slate-500">Nama menu bisa sedikit berbeda tergantung versi aplikasi.</p>
      </details>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFiles(e.dataTransfer.files);
        }}
        className={`rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
          dragging
            ? "border-fuchsia-500 bg-fuchsia-50 dark:bg-fuchsia-950/30"
            : "border-slate-300 dark:border-slate-700"
        }`}
      >
        <p className="text-sm font-medium">{busy ? "Membaca file…" : "Tarik file ke sini"}</p>
        <p className="mt-1 text-xs text-slate-500">ZIP dari Instagram, atau followers_1.json + following.json</p>
        <button type="button" className="btn-ghost mt-3" disabled={busy} onClick={() => inputRef.current?.click()}>
          Pilih file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".zip,.json,application/zip,application/json"
          multiple
          hidden
          onChange={(e) => {
            void handleFiles(e.target.files ?? []);
            e.target.value = "";
          }}
        />
      </div>

      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
