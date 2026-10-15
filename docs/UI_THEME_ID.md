# Tema LRM bergaya Vant

Frontend tetap Next.js/React. Desain mengikuti gaya Vant: aksen biru, permukaan
bersih, kartu dengan sudut membulat, form yang nyaman disentuh, dan tab navigasi
bawah pada layar kecil. Paket Vue `vant` tidak dipasang.

## Yang berubah

- Tema terang menjadi bawaan. Cookie mode gelap yang sudah dipilih tetap dihormati.
- Warna dan permukaan bersama berlaku pada dashboard, kalender, media, dan pengaturan.
- Login, pendaftaran, dan pemulihan akun menggunakan kerangka autentikasi baru.
- Navigasi ponsel: Calendar, Media, Analytics, Settings; menu samping tetap tersedia.
- Tombol loading dinonaktifkan untuk mencegah submit berulang; input memiliki label,
  hubungan ke pesan error, dan indikator fokus keyboard.
- Tanda teks LRM memakai aksen biru sambil menunggu logo resmi.

## Pengaturan

Token dan aturan tema: `apps/frontend/src/app/vant-theme.scss`.
Tema dibatasi oleh class body `lrm-ui`, dengan mode `light` atau `dark`.
Preview posting sosial mempertahankan warna platform masing-masing.
Batas navigasi ponsel mengikuti breakpoint aplikasi: maksimal 1025px.

## Verifikasi sebelum push

Build produksi frontend lulus. Chromium lokal dipakai untuk memeriksa login pada
1440px dan 390px, label input, respons error login dengan API fixture, warna tombol,
cookie tema, dan tidak adanya overflow horizontal. Dashboard dengan API fixture
lokal diuji untuk tab aktif, drawer, tombol ganti tema, dan navigasi desktop.
Tidak ada error JavaScript pada kedua pemeriksaan browser tersebut.
Fixture tidak membuat akun, menyimpan password, atau menghubungkan akun sosial.

Deployment VPS dan pengujian aplikasi sebenarnya tetap mengikuti workflow utama.
Lulusnya pemeriksaan UI lokal bukan bukti deployment atau posting sosial berhasil.

## Login aplikasi internal

Halaman masuk dan pendaftaran hanya menawarkan email/kata sandi. Google, GitHub,
Apple, OIDC, Farcaster, dan wallet tidak digunakan untuk identitas pengguna.
Guard backend pada controller `/auth` menolak provider non-LOCAL, provider token,
serta endpoint login OAuth/Farcaster. Parameter provider pada halaman pendaftaran
tidak lagi melewati pembatasan registrasi. Koneksi OAuth akun Instagram, TikTok,
dan Threads memakai controller integrasi terpisah dan tetap tersedia.
Workflow menguji penolakan login eksternal sebelum menjalankan pengujian
registrasi dan login lokal pada database sementara.

Pemeriksaan tambahan: build produksi frontend/backend/worker lulus; Chromium
memverifikasi login lokal desktop/ponsel, pendaftaran lokal dengan API fixture,
respons error form, dan penolakan bypass registrasi melalui query provider.
Uji HTTP pada guard backend yang sudah dikompilasi memastikan enam provider
login eksternal dan provider token ditolak, sementara LOCAL tetap diizinkan.
Hasil ini belum membuktikan deployment terbaru selesai di VPS.
