# Bukti pengujian dan batas deployment

Pengujian lokal dilakukan di lingkungan cloud. Pembaruan 15 Oktober 2026
mencakup hasil GitHub Actions dan keluaran terminal VPS yang dikirim pengguna;
agen belum memiliki akses SSH langsung ke VPS `31.97.51.194`.

| Pemeriksaan | Hasil yang diamati |
| --- | --- |
| Receiver dan bootstrap | 7 pengujian Python lulus: archive/image scope, revision, penolakan perintah bebas, rollback image, izin media, dan perlindungan direktori proyek lain |
| Startup aplikasi | Frontend, backend, dan worker berjalan melalui PM2 7.0.4 dengan konfigurasi path lokal |
| Nginx | Konfigurasi proxy diuji pada container Nginx; `/healthz` dan routing API berfungsi |
| Fungsi aplikasi melalui Nginx | 7 pengujian lulus: katalog tiga jaringan, worker, login/registrasi, beberapa akun uji, kalender, media, dan halaman LRM |
| Database/Redis/Temporal khusus CI | Empat layanan mencapai status healthy; Temporal menggunakan PostgreSQL tanpa Elasticsearch |
| Backup/restore PostgreSQL | Dump database uji dibuat, nilai uji diubah dari 1 ke 2, lalu restore mengembalikannya ke 1 |
| Workflow dan script | YAML, konfigurasi Compose, serta syntax Bash/Python/Node diperiksa |
| Build image dan pengujian GitHub | Run `38653148789` berhasil berdasarkan keluaran GitHub CLI: build image dan pengujian aplikasi lulus; deployment dan HTTPS dilewati |
| SSH ke VPS | Koneksi dari sesi ini ke `31.97.51.194:1506` ditolak; tidak ada private key administrator VPS yang tersedia |
| API GitHub | Permintaan ditolak oleh proxy HTTP; daftar Secrets dan status Actions belum dapat diverifikasi |
| DNS domain | Resolver cloud gagal; record `lrmsosmed.playgo.id` belum dapat diverifikasi |
| Persiapan VPS | Pengguna menjalankan bootstrap; receiver melaporkan `CURRENT_IMAGE not-deployed`. Kunci khusus dan lima Secrets berhasil dibuat menurut keluaran terminal |
| Deployment VPS dan domain HTTPS | Belum dilakukan; DNS diasumsikan belum dibuat. NPM dan kredensial Instagram disiapkan pengguna; koneksi OAuth belum diuji |

Pengujian akun menggunakan record sementara dengan token uji nonaktif, bukan
OAuth atau penerbitan langsung ke platform sosial. Agen tidak mengubah DNS atau mengakses data CCTV. Pengguna telah menambahkan
Proxy Host khusus LRMSosmed di NPM dan konfigurasi privat khusus proyek di VPS.

Workflow akan membedakan build/test berhasil, receiver VPS berhasil, dan
verifikasi HTTPS berhasil. Pengiriman commit saja tidak membuktikan ketiga tahap
tersebut selesai. Ikuti [panduan deployment](DEPLOY_VPS_ID.md) untuk prasyarat dan
pemulihan.
