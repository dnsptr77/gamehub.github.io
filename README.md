# 🛡️ Akun WS+TLS — VMess / VLESS / Trojan

Halaman web untuk **mengambil & memfilter akun dari link subscription**, khusus
hanya yang menggunakan **WebSocket + TLS** (WS+TLS).

## Fitur

- ⚡ Ambil otomatis dari link subscription (terisi default, bisa diganti)
- 🎯 Filter ketat: hanya `network = ws` **dan** `security = tls`
- 📋 Salin link per akun, salin semua sekaligus, salin config JSON V2Ray/Xray
- 📱 QR code per akun (siap discan v2rayNG / NekoBox / v2rayN)
- 💾 Download daftar `.txt` dan file subscription base64 (siap diimpor ulang)
- 🔍 Pencarian + filter protokol (VMess / VLESS / Trojan)
- 🔄 Refresh manual & otomatis tiap 5 menit (server subscription sering berganti akun)
- 🔒 Semua diproses di browser — tidak ada data yang dikirim ke pihak lain

## Cara pakai

### Langsung dari GitHub Pages
Buka `https://<username>.github.io/<repo>/` → klik **Ambil & Filter**.

Jika semua metode pengambilan gagal karena CORS:
1. Buka link subscription di tab browser baru
2. Salin seluruh isinya (base64 / daftar link)
3. Klik **“Tempel isi subscription manual”** di halaman ini → tempel → **Proses Teks**

### Menjalankan server lokal (bebas CORS)
```bash
node server.js
# buka http://localhost:8080
```
Server lokal menyediakan endpoint `/api/sub?url=...` yang mengambil subscription
dari sisi server, sehingga tidak terkena masalah CORS. Butuh Node.js ≥ 18.

## Struktur file

| File | Fungsi |
|---|---|
| `index.html` | Struktur halaman |
| `style.css` | Tampilan (tema gelap) |
| `parser.js` | Parser & filter VMess/VLESS/Trojan (murni, bisa diuji di Node) |
| `app.js` | Logika UI, pengambilan subscription multi-metode |
| `qrcode.min.js` | Library QRCode.js (MIT, © davidshimjs) — disertakan lokal |
| `server.js` | Server lokal opsional + proxy subscription |

## Catatan

- Link subscription tersimpan di `localStorage` browser Anda.
- Halaman ini juga menerima parameter `?url=<link subscription>` untuk langsung
  memuat subscription tertentu.
- Akun dari subscription publik berganti cepat — gunakan tombol Refresh / auto-refresh.
