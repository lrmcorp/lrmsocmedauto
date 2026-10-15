# Pengembangan studio internal LRM

Status: rancangan dan audit awal. Pengelolaan akun per anggota dan AI pribadi
belum diimplementasikan. Dokumen ini bukan bukti deployment fitur tersebut.

## Permintaan dan keputusan

- Frontend tetap Next.js; desain mengikuti screenshot hrd.playgo.id yang akan
  disediakan pemilik. Lingkungan pengembangan menerima HTTP CONNECT 403 ketika
  mengakses situs tersebut, sehingga tampilan belum dapat dibandingkan.
- Login tetap username dan password. Tidak ada pendaftaran publik.
- Superowner membuat akun anggota dari panel internal tanpa undangan email.
- Pilihan pemilik untuk AI: API key OpenAI pribadi per anggota dan unggah gambar
  langsung ke LRMSosmed. Ini tidak menyinkronkan ChatGPT Projects dan bukan login
  OAuth akun ChatGPT. Tagihan API terpisah dari langganan ChatGPT.

## Izin yang direncanakan

Superowner memilih akun Instagram, TikTok, atau Threads yang dapat diakses anggota.
Kata sandi akun sosial tidak dibagikan: anggota menggunakan koneksi OAuth yang
telah disimpan server. Akun yang tidak ditugaskan tidak terlihat dan tidak bisa
diakses melalui API, termasuk dengan menebak ID.

| Izin | Perilaku |
| --- | --- |
| Lihat akun | Melihat akun yang ditugaskan dan kontennya |
| Buat/edit draf | Menyimpan draf tanpa mengirimnya ke platform |
| Jadwalkan | Menempatkan konten pada waktu penerbitan mendatang |
| Terbitkan sekarang | Mengirim konten langsung ke platform |
| Hapus konten | Menghapus draf atau membatalkan jadwal yang diizinkan |
| Analitik | Melihat statistik akun yang ditugaskan |
| Kelola koneksi | Menambah, menghubungkan ulang, atau melepas koneksi akun |
| Kelola anggota | Membuat, menonaktifkan, dan mengatur izin anggota |

Anggota baru tidak mendapat akses akun atau izin penerbitan secara otomatis.
Superowner tetap memiliki akses penuh; peran pemilik tidak dapat diberikan melalui
form anggota biasa. Perubahan izin harus berlaku pada permintaan server berikutnya.
Kebijakan untuk jadwal yang sudah tersimpan saat akses dicabut harus terlihat jelas
di UI dan ditegakkan kembali sebelum worker menerbitkan konten.

## Audit awal

- Fitur tim yang ada memakai email dan undangan; belum cocok untuk akun internal
  yang dibuat pemilik.
- Keanggotaan saat ini berlaku untuk seluruh workspace; belum ada penugasan akun
  atau izin pembuatan/penerbitan per anggota.
- Pemeriksaan ADMIN sebelumnya dilewati jika billing tidak dikonfigurasi.
  Perbaikan kecil terpisah mempertahankan pemeriksaan role pada instalasi internal;
  uji regresi mencakup USER, ADMIN, SUPERADMIN dengan dan tanpa billing.
- Integrasi OpenAI yang ada memakai satu OPENAI_API_KEY global, bukan milik anggota.

## Syarat sebelum fitur dinyatakan siap

- Migrasi tambahan dengan backup dan rollback yang menjaga akun/konten lama.
- Uji server dengan dua anggota dan dua akun: akun yang tidak ditugaskan tidak
  dapat dibaca, diedit, dijadwalkan, diterbitkan, atau diekspor.
- Semua jalur penerbitan diperiksa, termasuk bulk, duplikasi, impor, API publik,
  koneksi OAuth, dan aktivitas worker yang sudah masuk antrean.
- Key pribadi dienkripsi di server, tidak dikembalikan melalui API/log, bisa
  diganti/dihapus, dan hanya digunakan dalam konteks pemilik key tersebut.
- Uji UI desktop/mobile setelah screenshot referensi tersedia.
- Laporan membedakan commit, push, workflow, deployment, dan verifikasi HTTPS.
