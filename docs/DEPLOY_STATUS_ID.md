# Bukti pengujian dan batas deployment

Pemeriksaan dilakukan pada 14 Oktober 2026 di lingkungan cloud proyek, bukan pada
VPS `31.97.51.194`.

| Pemeriksaan | Hasil yang diamati |
| --- | --- |
| Receiver dan bootstrap | 7 pengujian Python lulus: archive/image scope, revision, penolakan perintah bebas, rollback image, izin media, dan perlindungan direktori proyek lain |
| Startup aplikasi | Frontend, backend, dan worker berjalan melalui PM2 7.0.4 dengan konfigurasi path lokal |
| Nginx | Konfigurasi proxy diuji pada container Nginx; `/healthz` dan routing API berfungsi |
| Fungsi aplikasi melalui Nginx | 7 pengujian lulus: katalog tiga jaringan, worker, login/registrasi, beberapa akun uji, kalender, media, dan halaman LRM |
| Database/Redis/Temporal khusus CI | Empat layanan mencapai status healthy; Temporal menggunakan PostgreSQL tanpa Elasticsearch |
| Backup/restore PostgreSQL | Dump database uji dibuat, nilai uji diubah dari 1 ke 2, lalu restore mengembalikannya ke 1 |
| Workflow dan script | YAML, konfigurasi Compose, serta syntax Bash/Python/Node diperiksa |
| Build image lengkap di cloud | Belum lulus: ruang disk cloud tidak cukup; image lengkap wajib dibangun dan diuji oleh workflow sebelum deployment |
| SSH ke VPS | Koneksi dari sesi ini ke `31.97.51.194:1506` ditolak; tidak ada private key administrator VPS yang tersedia |
| API GitHub | Permintaan ditolak oleh proxy HTTP; daftar Secrets dan status Actions belum dapat diverifikasi |
| Deployment VPS dan domain HTTPS | Belum dilakukan; domain lengkap serta provisioning receiver/Secrets masih diperlukan |

Pengujian akun menggunakan record sementara dengan token uji nonaktif, bukan
OAuth atau penerbitan langsung ke platform sosial. Tidak ada DNS, Nginx Proxy
Manager VPS, database VPS, layanan lain, atau data CCTV yang diubah.

Workflow akan membedakan build/test berhasil, receiver VPS berhasil, dan
verifikasi HTTPS berhasil. Pengiriman commit saja tidak membuktikan ketiga tahap
tersebut selesai. Ikuti [panduan deployment](DEPLOY_VPS_ID.md) untuk prasyarat dan
pemulihan.
