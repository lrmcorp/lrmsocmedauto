# Deployment LRMSosmed ke VPS

Repository: `lrmcorp/lrmsocmedauto`, branch: `main`. Nama layanan dan direktori
khusus: `lrmsosmed` dan `/opt/lrmsosmed`. VPS yang dituju adalah `31.97.51.194`,
dengan port SSH terakhir diketahui `1506`. Domain proyek adalah
`lrmsosmed.playgo.id`; DNS dan konfigurasi NPM perlu diperiksa di VPS.

## Cara kerja

Push ke `main` menjalankan workflow **LRMSosmed - Test and Deploy**. GitHub
membangun image dari lockfile, mengompilasi frontend/backend/worker, menguji
receiver, lalu menjalankan pengujian aplikasi pada database sementara.
Pengujian mencakup login, pembatasan registrasi, dua akun uji per jaringan,
kalender, unggahan, halaman LRM, dan koneksi worker ke Temporal.

Deployment baru aktif setelah variable `ENABLE_VPS_DEPLOY=true`. Image yang
lulus pengujian dipublikasikan ke GHCR. Melalui SSH, receiver khusus proyek
menerima SHA commit dan digest image, lalu VPS menarik layer dari GHCR. VPS tidak membangun source; ini mengurangi beban terhadap
aplikasi lain. Tidak diperlukan token registry permanen di VPS: token job sementara dikirim
melalui stdin SSH, digunakan pada konfigurasi Docker privat sementara, lalu dihapus.

Receiver hanya menerima `status`, `deploy <SHA>`, `rollback <SHA>`, atau
`deploy-registry <SHA> <digest>`. Registry dibatasi ke
`ghcr.io/lrmcorp/lrmsocmedauto`, digest dipin, dan label source/revision diverifikasi. Kunci
Actions tidak mendapat shell umum, forwarding SSH, grup Docker, atau izin
menjalankan perintah CCTV. Receiver menolak archive image dengan nama proyek
lain atau label source/revision yang tidak sesuai sebelum `docker load`.
Deployment diserialkan oleh GitHub concurrency dan lock khusus di VPS.

## 1. Periksa VPS sebelum memasang

Buka terminal VPS dari panel hosting dengan akun administrator yang tersedia.
Gunakan checkout baru repository ini; jangan menggunakan receiver atau kunci
deployment CCTV. Jika repository privat, autentikasikan GitHub melalui mekanisme
yang tersedia, bukan dengan menulis token ke URL Git atau chat.

Dari checkout tersebut:

```sh
sudo bash deploy/inventory.sh
```

Periksa layanan, port, ruang disk, dan nama jaringan container Nginx Proxy Manager
(NPM). Script hanya membaca metadata. Jangan membagikan isi `.env`, private key,
rekaman CCTV, atau kredensial aplikasi.

Pilih jaringan NPM yang benar dari hasil pemeriksaan. Container NPM harus
terdaftar pada jaringan tersebut. Jika NPM menggunakan image/nama khusus yang
tidak terdeteksi script, periksa konfigurasi Docker terlebih dahulu; script tidak
akan menebak atau membuat jaringan pengganti.

## 2. Siapkan proyek dengan domain dan jaringan yang telah diperiksa

Docker Compose minimal 2.24.4 diperlukan. Script berikut dijalankan di VPS,
dengan mengganti dua nilai contoh menggunakan hasil pemeriksaan:

```sh
sudo python3 deploy/bootstrap.py \
  --domain lrmsosmed.playgo.id \
  --npm-network NAMA_JARINGAN_NPM \
  --ssh-port 1506
```

Bootstrap memilih port host yang belum dipakai dari pemeriksaan socket dan
port Docker. Port ini hanya dibind ke `127.0.0.1`, tidak dibuka ke Internet.
Receiver memerlukan minimal 8 GiB ruang disk kosong, serta ruang sebesar isi
image yang belum dikompresi ditambah cadangan 3 GiB. Jika kapasitas tidak cukup,
deployment ditolak; script tidak membersihkan image, backup, atau data aplikasi
lain secara otomatis.
Backup juga memeriksa kapasitas database dan unggahan sebelum menulis snapshot.
Storage driver Docker diperiksa; driver yang tidak mendukung copy-on-write
ditolak untuk menghindari penggandaan image besar pada disk VPS bersama.
Tujuan NPM adalah **`lrmsosmed-app:5000` pada jaringan Docker yang sama**,
bukan `localhost` di container NPM. Alamat subnet tidak dikarang dan tidak
ditambahkan ke konfigurasi aplikasi lain.

Script menolak direktori `/opt/lrmsosmed` atau nama pengguna deployment yang sudah
dipakai tanpa penanda proyek ini. Pengulangan setup menjaga `.env`, kunci, data,
dan unggahan yang sudah ada. Jangan menghapus data agar pemeriksaan bisa lolos.

Bootstrap membuat:

| Lokasi | Isi |
| --- | --- |
| `/opt/lrmsosmed/shared/.env` | Konfigurasi privat, rahasia lokal acak, dan kredensial platform |
| `/opt/lrmsosmed/shared/compose.yaml` | Hanya stack Docker proyek ini |
| `/opt/lrmsosmed/shared/uploads` | Unggahan pengguna, dipertahankan antar deployment |
| `/opt/lrmsosmed/backups` | Snapshot database dan unggahan sebelum pembaruan |
| `/opt/lrmsosmed/access/actions_ed25519` | Private key SSH khusus proyek, mode 0600 |
| `/opt/lrmsosmed/access/known_hosts` | Host key publik dari VPS sendiri, dengan port yang dipilih |

Pengguna baru adalah `deploy-lrmsosmed`. Pengguna ini memakai forced command yang
root-owned. Script tidak mengubah port SSH, firewall, DNS, NPM, layanan lain,
daemon Docker, atau isi proyek CCTV. Database/Redis/Temporal tidak mempublikasikan
port host. Volume memakai prefix Compose `lrmsosmed` dan jaringan backend khusus.
Temporal menggunakan PostgreSQL visibility, sehingga stack ini tidak memerlukan
Elasticsearch tambahan.

## 3. Isi GitHub Actions Secrets dan Variables

Buka repository → **Settings → Secrets and variables → Actions**.

| Secret | Isi |
| --- | --- |
| `VPS_HOST` | `31.97.51.194` |
| `VPS_PORT` | Port SSH yang telah diperiksa, awalnya `1506` |
| `VPS_USER` | `deploy-lrmsosmed` |
| `VPS_SSH_KEY` | Isi private key khusus `/opt/lrmsosmed/access/actions_ed25519` |
| `VPS_KNOWN_HOSTS` | Isi `/opt/lrmsosmed/access/known_hosts` |

Masukkan private key langsung ke formulir GitHub Secret melalui sesi terminal
privat Anda. Jangan kirim private key di chat atau memasukkannya ke repository.
Jika GitHub CLI di VPS sudah terautentikasi dengan izin mengelola Secrets,
private key dapat dimasukkan tanpa ditampilkan:

```sh
sudo cat /opt/lrmsosmed/access/actions_ed25519 | gh secret set VPS_SSH_KEY --repo lrmcorp/lrmsocmedauto
sudo cat /opt/lrmsosmed/access/known_hosts | gh secret set VPS_KNOWN_HOSTS --repo lrmcorp/lrmsocmedauto
```

Periksa fingerprint host key langsung di terminal VPS:

```sh
sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

Workflow memakai `StrictHostKeyChecking=yes`. Tidak ada `ssh-keyscan` otomatis
untuk menerima host key baru saat deployment. Nama Secret tidak membuktikan
nilainya sudah diisi; workflow akan memeriksa kelengkapan dan koneksi sebenarnya.

Tambahkan Variables berikut:

| Variable | Isi |
| --- | --- |
| `PUBLIC_URL` | Opsional: `https://lrmsosmed.playgo.id` sudah menjadi nilai bawaan workflow; isi hanya jika alamat berubah |
| `ENABLE_VPS_DEPLOY` | `true` setelah receiver VPS, Secrets, dan jaringan NPM siap |
| `VERIFY_PUBLIC_HTTPS` | Bawaan aktif. Set `false` hanya saat menyiapkan aplikasi sebelum DNS/sertifikat tersedia; ubah ke `true` setelah DNS dan SSL siap |

Sebelum diaktifkan, workflow tetap menjalankan pengujian pada stack sementara
dengan konfigurasi origin `https://lrmsosmed.playgo.id`. Deployment ke VPS hanya
berjalan jika `ENABLE_VPS_DEPLOY=true`. Kunci CCTV tidak
dipakai ulang. Kunci privat yang tersimpan sementara di VPS dapat diarsipkan
secara aman setelah Secrets terbukti berfungsi; jangan menghapus public key.

## 4. Cloudflare dan Nginx Proxy Manager

Periksa DNS domain terlebih dahulu dan pastikan record yang akan digunakan tidak
milik aplikasi lain. Setelah domain dipilih, arahkan record tersebut ke IP VPS
melalui panel Cloudflare. Jangan mengubah record CCTV atau domain lain.

Pada NPM, buat **Proxy Host baru** khusus domain proyek:

- Domain Names: domain lengkap proyek.
- Scheme: `http`.
- Forward Hostname: `lrmsosmed-app`.
- Forward Port: `5000`.
- Aktifkan Websockets dan SSL untuk domain ini.

Pastikan NPM dan app berada pada jaringan yang diverifikasi saat bootstrap.
Tidak diperlukan restart NPM, Docker daemon, atau VPS. Untuk Cloudflare proxy,
gunakan TLS **Full (strict)** setelah sertifikat origin NPM valid. Jangan memakai
Flexible untuk origin aplikasi HTTPS ini.

## 5. Deployment dan pemeriksaan

Setelah prasyarat siap, aktifkan `ENABLE_VPS_DEPLOY=true`, lalu push ke `main`
atau pilih **Actions → LRMSosmed - Test and Deploy → Run workflow**.

Receiver membuat backup sebelum migrasi. App proyek ini dihentikan sementara
agar database dan unggahan konsisten; layanan lain tidak dihentikan. Migrasi
memakai `prisma-db-push` tanpa `--accept-data-loss` atau `--force-reset`.
Image baru harus lolos health check sebelum dicatat sebagai versi aktif.
Kegagalan mencoba menjalankan kembali image sebelumnya, sementara backup tetap
disimpan. Pembaruan schema yang tidak kompatibel mungkin membutuhkan pemulihan
database manual dari backup.

Workflow kemudian memeriksa HTTPS domain, `/healthz`, `/api/integrations`, dan
halaman login LRM. Hasil SSH berhasil belum sama dengan verifikasi HTTPS berhasil;
masing-masing tahap ditulis terpisah pada ringkasan GitHub Actions.

Di VPS, untuk melihat layanan proyek tanpa mencetak Secrets:

```sh
sudo /usr/local/sbin/lrmsosmed-receiver status
```

Stack tidak menyediakan signup publik, termasuk untuk akun pertama. Buat akun
owner melalui `deploy/provision-owner.py` pada terminal administrator VPS
(lihat `docs/OWNER_SETUP_ID.md`), lalu masukkan kredensial Meta/TikTok sebelum
menghubungkan akun Instagram, TikTok, atau Threads. Penerbitan sungguhan dan
analytics belum dianggap teruji hanya karena health check berhasil.

## Pemulihan

Untuk rollback image yang masih tersimpan di VPS, gunakan SHA lengkap versi yang
pernah berhasil:

```sh
sudo /usr/local/sbin/lrmsosmed-receiver 'rollback SHA_COMMIT_LENGKAP'
```

Rollback image tidak otomatis mengembalikan schema database. Jika perlu
mengembalikan database ke snapshot tertentu, periksa nama dan waktu backup dulu.
Pemulihan ini mengganti data database proyek dengan isi snapshot, sehingga data
setelah waktu backup tidak muncul pada database hasil restore. Script membuat
snapshot baru sebelum restore dan mempertahankan file unggahan yang lebih baru.
Perintah ini hanya tersedia bagi administrator VPS, bukan kunci Actions:

```sh
sudo /usr/local/sbin/lrmsosmed-restore NAMA_DIREKTORI_BACKUP --restore-database
```

State Temporal tidak di-reset. Periksa status dan jadwal posting sebelum
mengaktifkan kembali publikasi setelah pemulihan database. Jangan menjalankan
`docker compose down -v`, `docker system prune`, atau menghapus volume bersama
sebagai cara memperbaiki deployment. Backup tidak dihapus otomatis; tentukan
retensi dan salinan di luar VPS sesuai kapasitas, tanpa menyentuh data CCTV.

## Status harus dilaporkan terpisah

1. Commit berhasil di-push ke GitHub.
2. Run GitHub Actions benar-benar terlihat atau belum dapat diperiksa.
3. Receiver VPS melaporkan `DEPLOYMENT_OK` atau deployment gagal.
4. HTTPS dan fungsi aplikasi benar-benar lulus pemeriksaan atau masih terhambat.

Workflow upstream diarsipkan dalam `docs/upstream-ci/` agar jadwal dan rilis
Postiz tidak dijalankan pada repository LRM.

## Menjalankan aplikasi sebelum DNS tersedia

Set `ENABLE_VPS_DEPLOY=true` dan `VERIFY_PUBLIC_HTTPS=false` pada repository
Variables, lalu jalankan workflow secara manual. Build dan pengujian tetap wajib
lulus; receiver tetap memeriksa kesehatan aplikasi pada VPS. Hanya pemeriksaan
HTTPS publik yang ditunda dan ditandai UNVERIFIED pada ringkasan workflow.
Port host tetap `127.0.0.1`, tanpa membuka port publik atau mengubah DNS.
Koneksi OAuth Instagram belum dapat diuji sebelum HTTPS tersedia.

Setelah DNS siap, minta sertifikat untuk domain ini melalui NPM, aktifkan Force
SSL, ubah `VERIFY_PUBLIC_HTTPS=true`, lalu jalankan workflow kembali. Keberhasilan
internal tidak membuktikan HTTPS atau akses browser publik berhasil.

## Transfer melalui GHCR: maksimum 15 menit

Workflow memakai GHCR untuk menghindari transfer archive penuh melalui SSH.
Receiver membatasi autentikasi dan penarikan image menjadi 900 detik. Jika batas
terlampaui, proses gagal dan aplikasi lama belum dihentikan. Batas ini menjamin
transfer tidak berlangsung berjam-jam, bukan menjamin download sukses pada semua
koneksi. Build, upload GitHub ke GHCR, migrasi, dan health checks terpisah dari
batas transfer VPS. Job keseluruhan dibatasi 60 menit.

Layer dependensi dipisahkan dari source dan label commit. Cache build GitHub
dipakai agar layer yang tidak berubah dapat digunakan kembali. Docker pada VPS
menarik hanya layer yang belum tersedia. Deployment pertama tetap mengunduh
seluruh layer. Log pull menunjukkan progres per layer; tidak ada token ditampilkan.

Workflow memerlukan `packages: write` untuk token job. Lima Secrets VPS tetap
sama; jangan membuat PAT registry atau menggunakan kredensial CCTV. Token job
sementara dikirim lewat stdin SSH, disimpan hanya di direktori privat sementara,
dan dihapus setelah sukses, kegagalan, atau timeout yang ditangani receiver.

### Upgrade receiver yang sudah terpasang

Sebelum menjalankan workflow baru, perbarui source checkout bootstrap dari `main`
dan ulangi `deploy/bootstrap.py` dengan domain, jaringan NPM, dan port yang sama.
Bootstrap menjaga `.env` (termasuk kredensial Instagram), kunci, dan data proyek.
Receiver versi lama akan menolak perintah `deploy-registry`; workflow tidak boleh
mengklaim deployment berhasil jika receiver belum diperbarui.

Mode archive SSH lama tetap tersedia untuk pemulihan manual. Workflow utama
menggunakan `deploy-registry` dan tidak mengirim archive image lewat SSH.
