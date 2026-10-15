#!/usr/bin/env python3
"""Private VPS owner provisioning; no credentials in arguments, files, or chat."""
import fcntl
import getpass
import importlib.machinery
import importlib.util
import json
import os
from pathlib import Path
import re

ROOT = Path('/opt/lrmsosmed')

def main():
    os.umask(0o077)
    if os.geteuid() != 0 or not (ROOT / '.lrmsosmed-owned').is_file():
        raise RuntimeError('Run as VPS administrator after project deployment')
    username = input('Username pemilik [admin]: ').strip().lower() or 'admin'
    if not re.fullmatch(r'[a-z0-9][a-z0-9._-]{2,31}', username):
        raise RuntimeError('Username: 3-32 huruf/angka/titik/underscore/tanda hubung')
    existing = input('Email akun pemilik lama jika sudah ada; jika belum, tekan Enter: ').strip()
    if len(existing) > 254:
        raise RuntimeError('Email akun lama tidak valid')
    password = getpass.getpass('Kata sandi baru (minimal 12 karakter): ')
    confirmation = getpass.getpass('Ulangi kata sandi: ')
    if password != confirmation or len(password) < 12 or len(password.encode()) > 72:
        raise RuntimeError('Konfirmasi tidak sama atau panjang kata sandi tidak valid; tidak ada perubahan')
    loader = importlib.machinery.SourceFileLoader('lrm_receiver', '/usr/local/sbin/lrmsosmed-receiver')
    module = importlib.util.module_from_spec(importlib.util.spec_from_loader(loader.name, loader))
    loader.exec_module(module)
    with (ROOT / 'deploy.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        tag = module.read_current()
        if not tag:
            raise RuntimeError('Deploy versi terbaru terlebih dahulu')
        # Confirm the new provisioner exists before creating a backup or changing data.
        module.compose(tag, 'exec', '-T', 'app', 'test', '-f', '/app/deploy/provision-owner.cjs')
        module.backup(tag)
        payload = json.dumps({'username': username, 'password': password, 'existingEmail': existing}).encode()
        read_fd, write_fd = os.pipe()
        try:
            os.write(write_fd, payload)
        finally:
            os.close(write_fd)
        with os.fdopen(read_fd, 'rb') as source:
            module.compose(tag, 'exec', '-T', 'app', 'node', '/app/deploy/provision-owner.cjs', input_file=source, progress=True)
    print('Akun owner siap. Login dengan username yang Anda pilih dan kata sandi tadi.')

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        raise SystemExit(str(error))
