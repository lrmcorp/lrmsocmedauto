# Login internal: username dan kata sandi

Aplikasi tidak memiliki signup publik, Google login, atau password bawaan.
Username disimpan pada kolom `User.username` yang unik dan diproses dalam huruf
kecil. Email tetap dapat ada sebagai metadata akun, tetapi tidak dipakai untuk
login. Akun lama tidak dihapus dan tidak diberi username secara diam-diam.

## Upgrade pertama ke login username

1. Perbarui checkout source dan ulangi bootstrap dengan domain/jaringan/port yang
   sama. Receiver baru menjalankan migrasi aditif sesudah backup dan sebelum
   sinkronisasi Prisma. Receiver lama dapat menolak migrasi indeks pada database
   berisi akun; jangan memakai `--accept-data-loss` untuk melewatinya.
2. Jalankan workflow `main` dan pastikan deployment berhasil. Health endpoint tetap
   memeriksa database walaupun registrasi selalu ditutup.
3. Dari checkout terbaru pada terminal administrator VPS, jalankan:

   ```sh
   sudo python3 deploy/provision-owner.py
   ```

4. Pilih username (bawaan `admin`). Jika belum pernah membuat akun, tekan Enter
   pada pertanyaan email lama. Jika sudah memiliki akun owner, masukkan email
   akun tersebut untuk mempertahankan ID, workspace, dan semua datanya.
5. Masukkan kata sandi baru minimal 12 karakter (maksimal 72 byte UTF-8) dan ulangi.
   Input kata sandi tidak terlihat. Jangan kirim kata sandi ke chat.
6. Buka domain proyek dan login memakai username serta kata sandi tersebut.

Helper memakai lock khusus proyek, membuat backup, dan mengirim kredensial lewat
pipe stdin ke container. Tidak ada rahasia pada command arguments atau file
konfigurasi tambahan. Password hanya disimpan sebagai hash bcrypt. Akun yang
dibuat memiliki peran owner workspace dan superadmin sistem.

Jika database sudah berisi akun/data, helper menolak membuat owner baru tanpa
pemilihan akun owner yang ada. Akun staf tidak dapat dipromosikan oleh helper ini.
Pengulangan helper untuk akun owner yang sama mengganti username/password dengan
nilai yang baru Anda masukkan; data workspace tetap dipertahankan.

## Pemulihan

Untuk lupa kata sandi, jalankan helper yang sama melalui terminal administrator
VPS, dengan memilih email akun owner yang ada. Tidak ada reset password publik.
Backup dibuat sebelum perubahan akun. Rollback image tidak menyinkronkan schema
lama, sehingga kolom username baru tidak dihapus saat kembali ke image lama.

## Bukti pengujian lokal

- Build frontend/backend/worker lulus.
- Migrasi di database sementara dengan akun lama mempertahankan baris dan ID;
  dijalankan dua kali tanpa flag penerimaan kehilangan data.
- Provisioning owner baru, pembaruan owner lama, penolakan owner tambahan, dan
  penolakan promosi staf diuji pada database sementara.
- Controller login sebenarnya diuji melalui HTTP dengan repository pengguna dan
  database sementara: username huruf besar/kecil diterima; password salah dan
  login email ditolak; signup/OAuth ditolak; can-register selalu false.
- Browser desktop/ponsel: hanya username/password, seluruh rute signup menuju
  login, tanpa tautan Google/signup/recovery dan tanpa error JavaScript.

Deployment terbaru di VPS tetap perlu diverifikasi melalui workflow dan receiver.
