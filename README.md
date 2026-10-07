# Unfollower IG

Aplikasi web (Next.js) untuk melihat **followers**, **following**, dan **siapa yang tidak follow balik** akun Instagram kamu. Siap di-deploy ke **Vercel**.

## Fitur

- **Login Instagram** (username/email + password, mendukung verifikasi 2 langkah) → scan otomatis.
- **Upload data export** (ZIP/JSON dari fitur resmi "Unduh informasi Anda") — tanpa password, diproses 100% di browser.
- Daftar: *tidak follow balik*, *belum kamu follow balik*, *saling follow*, semua followers, semua following.
- Pencarian, tautan ke profil, dan **unduh CSV** per daftar.
- **Deteksi perubahan**: dibandingkan dengan scan sebelumnya (disimpan di `localStorage` browser kamu) → siapa yang baru unfollow / follower baru.
- Scan bisa **dilanjutkan** jika terkena rate limit atau koneksi putus.

## Penting: batasan & risiko

Instagram **tidak menyediakan API resmi** untuk membaca daftar followers/following. Mode login memakai endpoint web tidak resmi (meniru instagram.com), sehingga:

- Secara teknis bertentangan dengan Ketentuan Layanan Instagram; pada kasus jarang akun bisa dibatasi sementara. Gunakan seperlunya, hanya untuk akunmu sendiri.
- Endpoint bisa berubah kapan saja tanpa pemberitahuan.
- **Login dari server cloud (Vercel) sering memicu verifikasi keamanan (checkpoint) atau diblokir**, karena IP datacenter. Jika itu terjadi, pakai mode **Upload data export** — selalu bisa dipakai dan paling aman.

> Mode login diuji terhadap server Instagram tiruan (mock) dan unit test, bukan terhadap Instagram sungguhan. Perilaku nyata bisa berbeda.

## Cara kerja & keamanan

- Password hanya diteruskan ke Instagram saat login — **tidak disimpan dan tidak dicatat di log**.
- Sesi (cookie Instagram) disimpan di cookie `httpOnly` yang **dienkripsi AES-256-GCM** dengan `SESSION_SECRET`. Server tidak punya database; berlaku 7 hari atau sampai klik *Keluar*.
- Endpoint yang mengubah state memeriksa header `Origin`; cookie `SameSite=Lax`; respons API `no-store`.
- Daftar followers diambil **halaman per halaman** (100 akun/request) oleh browser dengan jeda acak, sehingga tiap request singkat dan muat di batas waktu fungsi Vercel.

## Deploy ke Vercel

1. Push repo ini ke GitHub (sudah), lalu di [vercel.com/new](https://vercel.com/new) **Import** repository ini. Framework terdeteksi otomatis sebagai Next.js.
2. Di **Settings → Environment Variables** tambahkan:

   | Nama | Nilai |
   | --- | --- |
   | `SESSION_SECRET` | string acak panjang, buat dengan `openssl rand -base64 32` |

   Tanpa variabel ini, login akan ditolak di production (sengaja, agar sesi tidak pernah dienkripsi dengan kunci lemah).
3. Klik **Deploy**. Tidak ada database atau layanan lain yang dibutuhkan.

## Jalankan lokal

```bash
npm install
cp .env.example .env.local   # isi SESSION_SECRET (opsional di dev)
npm run dev                  # http://localhost:3000
```

Skrip lain: `npm run typecheck`, `npm test`, `npm run build`.

## Cara mengunduh data export Instagram

1. Instagram → *Pengaturan* → *Pusat Akun* → *Informasi dan izin kamu* → *Unduh informasi kamu*.
2. *Unduh atau transfer informasi* → pilih akun → *Sebagian informasi* → centang **Pengikut dan yang diikuti**.
3. *Unduh ke perangkat*, rentang tanggal **Sepanjang waktu**, format **JSON**.
4. Setelah email datang, unduh ZIP-nya dan upload di tab **Upload data export** (atau upload `followers_1.json` + `following.json`).

## Struktur

```
src/app/api/auth/*     login, 2FA, logout, cek sesi
src/app/api/ig/*       ambil satu halaman followers/following, profil
src/lib/instagram.ts   klien endpoint web Instagram
src/lib/session.ts     cookie sesi terenkripsi
src/lib/compare.ts     logika perbandingan & diff snapshot
src/lib/export-parser.ts  parser data export Instagram
src/components/*       UI
tests/                 unit test (vitest)
```
