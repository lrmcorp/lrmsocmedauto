#!/usr/bin/env python3
"""Administrator-only restoration of one lrmsosmed backup; never granted to CI."""
import argparse
import fcntl
import importlib.util
import os
from pathlib import Path
import re
import tarfile


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('backup', help='Backup directory basename under /opt/lrmsosmed/backups')
    parser.add_argument('--restore-database', action='store_true', required=True)
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise RuntimeError('This operation is only available to the VPS administrator')
    if not re.fullmatch(r'[0-9]{8}T[0-9]{6}Z-[0-9a-f]{40}', args.backup):
        raise RuntimeError('Invalid backup name')
    # The installed executable has no .py extension, so use its known source loader.
    from importlib.machinery import SourceFileLoader
    loader = SourceFileLoader('receiver', '/usr/local/sbin/lrmsosmed-receiver')
    spec = importlib.util.spec_from_loader('receiver', loader)
    receiver = importlib.util.module_from_spec(spec)
    loader.exec_module(receiver)
    root = receiver.ROOT
    if not (root / '.lrmsosmed-owned').is_file():
        raise RuntimeError('Missing project ownership marker')
    backup = (root / 'backups' / args.backup).resolve()
    if backup.parent != (root / 'backups').resolve():
        raise RuntimeError('Backup must be inside this project')
    tag = (backup / 'image-tag').read_text().strip()
    if not re.fullmatch(r'[0-9a-f]{40}', tag):
        raise RuntimeError('Invalid backup image tag')
    receiver.run(['docker', 'image', 'inspect', f'lrmsosmed:{tag}'])
    with (root / 'deploy.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        current = receiver.read_current()
        if current:
            receiver.compose(current, 'stop', '-t', '30', 'app')
            try:
                receiver.backup(current)
            except Exception:
                receiver.compose(current, 'up', '-d', '--no-deps', 'app')
                raise
        try:
            with (backup / 'database.dump').open('rb') as database:
                receiver.compose(tag, 'exec', '-T', 'postgres', 'pg_restore', '-U', 'lrmsosmed',
                                 '-d', 'lrmsosmed', '--clean', '--if-exists', '--no-owner',
                                 '--no-privileges', '--exit-on-error', input_file=database)
            with tarfile.open(backup / 'uploads.tar.gz', 'r:gz') as media:
                for member in media.getmembers():
                    if member.name != 'uploads' and not member.name.startswith('uploads/'):
                        raise RuntimeError('Backup contains files outside the uploads directory')
                # Overlay the snapshot; never delete later uploads or touch .env.
                media.extractall(receiver.SHARED, filter='data')
            receiver.compose(tag, 'up', '-d', '--no-deps', 'app')
            if not receiver.healthy(tag):
                raise RuntimeError('Restored application did not pass readiness checks')
            (root / 'current-tag').write_text(tag + '\n')
            print(f'RESTORED {args.backup}; inspect scheduled posts before resuming publication')
        except Exception:
            print('Restoration stopped. The pre-restoration backup is retained; inspect this project before another change.')
            raise


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        raise SystemExit(str(error))
