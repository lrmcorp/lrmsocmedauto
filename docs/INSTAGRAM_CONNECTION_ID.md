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
