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
