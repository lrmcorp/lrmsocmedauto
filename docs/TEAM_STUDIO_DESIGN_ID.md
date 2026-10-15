# Studio internal LRM: anggota, akun sosial, dan OpenAI

## Tampilan dan navigasi

Halaman utama `/studio` mengikuti screenshot HRD yang diberikan pemilik: latar abu
muda, sidebar putih, aksen hijau, kartu statistik, tindakan cepat, dan aktivitas
terbaru. Angka berasal dari database, dibatasi pada akun yang dapat diakses.
Navigasi mobile memakai tombol menu. Zona jadwal selalu Asia/Jakarta (WIB),
termasuk saat browser pengguna berada di zona waktu lain.

- Beranda: jumlah akun, draf, jadwal, konten terbit dan koneksi yang perlu diperiksa.
- Konten & Jadwal: maksimal 200 postingan terbaru, filter status, edit draf,
  penghapusan draf atau pembatalan jadwal.
- Buat Konten: pilih akun, caption, feed/reel/story Instagram, unggah/pilih media,
  simpan draf, jadwalkan atau antrekan penerbitan segera.
- Akun Sosial: daftar akun yang ditugaskan dan ringkasan status publikasinya.
- Anggota & Akses: hanya superowner; buat username/password, pilih akun, atur izin,
  nonaktifkan anggota dan reset password.
- Asisten AI: API key OpenAI pribadi, caption dan gambar yang disimpan ke media.
- Pesan Instagram: inbox Standalone dan balasan teks manual sesuai izin Meta.

Superowner dapat membuka **Editor lanjutan** untuk fitur kalender, pengaturan
platform, statistik dari platform, dan koneksi OAuth yang sudah ada.
Halaman lanjutan memakai aksen hijau yang sama. Anggota diarahkan ke studio dan
API lama yang memberi akses seluruh workspace ditolak oleh server.

## Menambahkan anggota

1. Masuk sebagai pemilik dan buka **Anggota & Akses → Tambah Anggota**.
2. Isi nama, username (3–32 karakter) dan password minimal 12 karakter,
   maksimal 72 byte UTF-8. Berikan password melalui saluran privat.
3. Pilih akun Instagram/TikTok/Threads dan hak akses yang diperlukan.
4. Klik **Simpan Anggota**. Pengguna langsung dapat login; tidak ada signup atau
   undangan email. Anggota baru tidak mendapat akun atau izin otomatis.

Nama pengguna tidak membedakan huruf besar dan kecil. Akun sosial memakai koneksi
OAuth milik workspace; password Instagram tidak dibagikan kepada anggota.
Satu aplikasi Meta dapat melayani banyak akun yang memenuhi persyaratan Meta.

| Izin | Perilaku |
| --- | --- |
| Buat & edit draf | Membuat atau mengedit draf pada akun tugas |
| Jadwalkan konten | Mengantrekan penerbitan pada waktu mendatang; perlu izin draf |
| Terbitkan sekarang | Mengantrekan penerbitan segera; perlu izin draf |
| Hapus / batalkan | Menghapus draf atau membatalkan konten yang belum terbit |
| Lihat analitik | Ringkasan jumlah status publikasi akun tugas, bukan insight langsung dari platform |
| Baca DM Instagram | Membuka percakapan akun Instagram Standalone tugas |
| Balas DM Instagram | Membalas teks dalam jendela Meta; perlu izin baca |
| Gunakan AI pribadi | Menyimpan API key sendiri dan meminta caption/gambar OpenAI |

Koneksi OAuth, pengelolaan anggota, API key workspace, serta perubahan akun pemilik
khusus superowner. Form anggota tidak dapat membuat atau menaikkan peran pemilik.
Pemilik yang sudah ada dilindungi. Keanggotaan USER/ADMIN lama tidak otomatis
mendapat akses semua akun: pemilik perlu menugaskan akun lewat studio.

Menonaktifkan anggota memblokir permintaan server berikutnya. Worker membaca ulang
keanggotaan, penugasan akun dan izin sebelum mengirim konten, termasuk tahap akhir
penerbitan yang masih menunggu pemrosesan platform. Konten yang sudah diterima
platform tidak dapat ditarik kembali hanya dengan mencabut izin. Konten lama yang
dibuat melalui editor pemilik mempertahankan perilakunya.

Reset password berlaku untuk login berikutnya, tetapi tidak membatalkan JWT yang
sudah ada. Jika akses harus segera dihentikan, nonaktifkan anggota. Reset melalui
panel dibatasi pada identitas yang hanya berada di satu workspace.

## Media dan penerbitan

Media studio bersifat milik pengguna untuk pemilihan/unggah di UI. Server tidak
menerima ID media pengguna lain dari composer. URL media adalah URL publik dengan
nama acak agar platform sosial dapat mengunduhnya: bukan penyimpanan dokumen privat.
Unggahan studio dibatasi 15 MB per berkas, dengan pemeriksaan tipe berkas sebenarnya.
Gambar dari ChatGPT dapat diunduh dan diunggah melalui **Buat Konten**.

Draf tunggal dapat diedit. Draf lama yang berisi rangkaian beberapa postingan perlu
editor lanjutan pemilik. Mengedit draf memulihkan urutan media yang masih ada pada pustaka pengguna;
pengguna diminta memeriksa kembali pilihan medianya.
TikTok pada composer sederhana memakai privasi SELF_ONLY; gunakan editor lanjutan
pemilik untuk pengaturan TikTok lainnya. Validasi media/platform tetap berlaku.

**Terbitkan sekarang** berarti masuk antrean; keberhasilan platform baru dibuktikan
oleh status konten **Terbit** dan tautan publik bila tersedia.

## OpenAI pribadi

1. Pemilik memberi izin AI untuk anggota.
2. Anggota membuka **Asisten AI**, memasukkan API key OpenAI miliknya dan menyimpan.
3. Pilih caption atau gambar, isi arahan, kemudian jalankan permintaan.
4. Caption dapat dipakai di composer; gambar tersimpan di **Media Anda**.

Ini bukan OAuth ChatGPT dan tidak menyinkronkan ChatGPT Projects. Tagihan API
terpisah dari langganan ChatGPT. Key perlu saldo API dan akses model yang sesuai.
Model awal: `gpt-4.1-mini` untuk caption dan `gpt-image-1` untuk gambar.
Status "key tersimpan" tidak membuktikan key valid; permintaan nyata diperlukan.

Key disimpan di tabel terpisah dengan AES-256-GCM, IV acak, dan identitas pengguna
sebagai AAD. Kunci enkripsi diturunkan lewat HKDF dari `JWT_SECRET` server yang
minimal 32 karakter. Tidak ada secret GitHub baru. Key tidak pernah dikembalikan
oleh endpoint, tidak memakai localStorage, dan dapat diganti atau dihapus sendiri.
SDK memakai client per permintaan, tanpa fallback ke key pengguna lain/global.
Error SDK dikembalikan sebagai pesan umum; telemetri request pengelolaan key dan
password ditolak, pencatatan input/output OpenAI dimatikan. Session replay juga
menyamarkan input/teks dan memblokir media internal.

Backup database dan `.env` harus disimpan privat bersama. Mengubah JWT_SECRET
membuat key yang sudah tersimpan tidak terbaca; pengguna perlu memasukkan ulang key.
Fitur AI lama pada editor lanjutan pemilik tetap merupakan fitur upstream; alur
OpenAI pribadi yang dijelaskan di sini adalah **Asisten AI** di studio internal.

## Deployment dan pemulihan

Workflow tetap memakai cache build dan transfer layer GHCR; batas transfer 900
detik tetap berlaku. Tidak ada pengiriman arsip penuh baru lewat SSH.
Perubahan source service Prisma tidak lagi membatalkan cache dependency Docker;
file schema saja disalin sebelum instalasi dependency. Perubahan schema/dependency
tetap memerlukan layer dependency baru.
Receiver yang sudah mendukung `/app/deploy/migrate.cjs` tidak perlu bootstrap ulang.
Receiver membuat backup PostgreSQL, unggahan, dan `.env` sebelum migrasi.

Migrasi hanya menambah `Media.studioOwnerId`, `Post.studioAuthorId`,
`Post.studioAction`, dan tabel StudioAccess/StudioCredential. Tidak mengganti
username/password, koneksi, data lama, atau `.env`. Tidak ada reset database.
Rollback image tidak menyinkronkan schema lama; kolom baru tetap dipertahankan.
Ikuti [panduan deployment/pemulihan](DEPLOY_VPS_ID.md) jika perlu kembali ke image lama.

## Bukti pengujian dan batasannya

- Build produksi frontend, backend, dan worker dijalankan lokal.
- `deploy/tests/studio-http.cjs`: controller Nest, JWT login/middleware, PostgreSQL
  disposable, create/edit draf melalui PostsService asli, batas akun/peran,
  enkripsi key, larangan key pengguna lain, dan pencabutan izin worker.
  Temporal dan permintaan OpenAI berbayar tidak dijalankan dalam harness lokal.
- `deploy/tests/studio-smoke.cjs` juga dijalankan oleh smoke workflow pada aplikasi
  lengkap dalam CI dengan database disposable `lrmsosmed_ci` dan Temporal nyata.
- `deploy/tests/studio-ui.cjs`: Chromium pada dashboard desktop dan layar 390px,
  pilihan anggota/izin, field key bertipe password, navigasi mobile, dan tampilan
  anggota tanpa panel pemilik. API memakai fixture; bukan bukti akses VPS.
- Uji OAuth Instagram dan permintaan OpenAI nyata tetap memerlukan kredensial
  privat dan pemeriksaan setelah deployment. Tidak ada konten uji dipublikasikan.

Rincian izin DM dan format foto/carousel/Reel/Story ada di [panduan Instagram](INSTAGRAM_CONNECTION_ID.md#inbox-dan-composer-instagram-di-studio-internal).
