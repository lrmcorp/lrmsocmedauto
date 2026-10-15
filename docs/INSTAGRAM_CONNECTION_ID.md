# Menghubungkan Instagram Standalone

Gunakan akun Instagram Professional (Business atau Creator). Halaman Facebook
tidak diperlukan untuk jalur Standalone. Saat aplikasi Meta dalam mode pengujian,
akun harus menjadi Penguji Instagram dan telah menerima undangannya.

Empat izin yang digunakan:

- `instagram_business_basic`
- `instagram_business_content_publish`
- `instagram_business_manage_comments`
- `instagram_business_manage_insights`

Status Siap untuk pengujian pada dashboard Meta berbeda dari izin yang diberikan
oleh akun. Periksa izin akun pada Instagram → Apps and websites → Active →
LRM Sosmed-IG → View and edit. Basic, publishing, insights, dan comments perlu
tersedia. Jangan menambahkan izin Facebook hanya untuk memperbaiki Standalone.

## Penanganan respons Meta

Aplikasi membaca daftar izin berbentuk string (termasuk koma dengan spasi atau
URL encoding), array, dan record status `granted`. Jika pertukaran token tidak
menyertakan seluruh metadata izin, aplikasi meminta daftar izin token dari Graph
Instagram. Status denied/declined tidak dianggap sebagai izin yang diberikan.
Izin tetap wajib; pemeriksaan tidak dilewati ketika respons tidak dapat dibaca.

Pesan koneksi membedakan code exchange, long-lived token exchange, permission
verification, profile lookup, dan daftar scope yang benar-benar kurang. Error
hanya menampilkan nama tahap, HTTP status, kode numerik Meta, atau nama scope yang
diharapkan. Token, App Secret, URL bertoken, dan respons mentah tidak ditampilkan.

Setelah deployment perbaikan, ulangi Add Channel → Instagram Standalone untuk
akun yang sama. Jika gagal, kirim hanya pesan error baru. Jangan mengirim token,
App Secret, URL callback berisi code, atau dump respons Meta ke chat.

## Verifikasi

Build backend dan worker diperiksa. Pengujian memakai respons Meta fixture untuk
format scope, metadata yang tidak lengkap, izin ditolak, error API/jaringan,
keamanan pesan error, dan permintaan autentikasi ulang. Pengujian ini bukan bukti
koneksi OAuth akun Instagram sebenarnya berhasil; itu memerlukan percobaan dari
browser pengguna setelah deployment.

## Inbox dan composer Instagram di studio internal

Menu **Pesan Instagram** tersedia untuk koneksi **Instagram Standalone**.
Superowner otomatis memiliki akses. Anggota membutuhkan penugasan akun serta
izin **Baca DM Instagram**; **Balas DM Instagram** adalah izin terpisah dan
memerlukan izin baca. Inbox memakai permintaan langsung ke Meta saat dimuat,
bukan webhook. Klik **Muat Inbox / Muat ulang** untuk pesan terbaru.

Jika koneksi dibuat sebelum fitur inbox:

1. Di Meta Developers, pastikan `instagram_business_manage_messages` ditambahkan
   pada aplikasi Instagram yang sama. Akun penguji harus menerima undangan jika
   aplikasi masih dalam mode pengembangan.
2. Di LRMSosmed, buka **Akun Sosial → Kelola Koneksi**, hubungkan ulang Instagram
   Standalone dan setujui izin pesan. Koneksi dicocokkan dengan akun yang sama.
3. Pada pengaturan Instagram profesional, aktifkan akses pesan untuk aplikasi atau
   alat terhubung (nama menu dapat berbeda menurut versi Instagram).
4. Buka **Pesan Instagram**, pilih akun, klik **Muat Inbox** dan pilih percakapan.

Izin pesan diminta saat OAuth baru; izin ini tidak dijadikan syarat wajib untuk
menghubungkan fitur penerbitan. Jika ditolak, penerbitan masih dapat digunakan,
sedangkan inbox akan menampilkan kesalahan izin dari pemeriksaan Meta.
Penggunaan akun di luar peran aplikasi tetap mengikuti App Review/akses Meta.

Inbox menampilkan riwayat teks dan menyediakan balasan teks manual. Pesan nonteks
ditandai sebagai lampiran; pengiriman lampiran, webhook, dan balasan otomatis belum
tersedia. Balasan dibatasi pada percakapan dengan pesan masuk dalam 24 jam terakhir
(yang tersedia pada halaman pesan terbaru), lalu Meta tetap memeriksa kebijakannya.
Handle percakapan ditandatangani, terikat pada pengguna/workspace/akun, dan berlaku
15 menit. Muat ulang inbox jika handle kedaluwarsa. Token Instagram tetap di server.
Tidak ada DM sungguhan yang dikirim dalam tes pengembangan.

### Composer seperti alur unggah Instagram

- **Foto:** tepat satu gambar untuk feed.
- **Carousel:** 2–10 foto/video, dapat diurutkan dengan tombol kiri/kanan, dengan
  pratinjau per slide dan indikator halaman.
- **Reel:** tepat satu video MP4/MOV, pratinjau vertikal; gunakan rasio 9:16.
- **Story:** tepat satu foto/video, pratinjau vertikal.

Unggah beberapa berkas sekaligus (maksimal 15 MB per berkas), pilih media, tulis
caption maksimal 2.200 karakter, kemudian simpan draf/jadwalkan/terbitkan sesuai
izin. Server memeriksa format dan urutan, bukan hanya pilihan tampilan. Foto,
carousel, dan Reel diterjemahkan ke payload feed/Reels/carousel sesuai jenis media;
Story memakai pengaturan Story. MOV dikenali sebagai video dan diperiksa tipe
berkasnya saat upload. Tidak ada crop, musik, stiker, atau filter native Instagram
pada pratinjau; media asli dipertahankan.

Draf yang dibuka kembali memulihkan urutan media milik pengguna dari pustaka dan
mendeteksi formatnya. Media milik pengguna lain tidak dapat digunakan ulang lewat
composer anggota. Data postingan lama dan koneksi yang sudah ada tidak dimigrasi
atau dihapus untuk pembaruan ini.

Pengujian: 21 tes Node mencakup autentikasi/izin/inbox dengan respons Meta tiruan;
uji HTTP dengan PostgreSQL menguji empat format, penolakan media yang tidak cocok,
urutan carousel, dan larangan inbox untuk anggota tanpa izin. Chromium menguji
pilihan format, pratinjau/urutan carousel dan tampilan percakapan memakai fixture.
Permintaan Meta nyata tetap perlu diverifikasi setelah izin dan koneksi akun siap.
