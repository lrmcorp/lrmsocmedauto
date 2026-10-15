#!/usr/bin/env python3
"""Root-owned receiver: only this application's immutable images may be deployed."""
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request

ROOT = Path('/opt/lrmsosmed')
SHARED = ROOT / 'shared'
PROJECT = 'lrmsosmed'
MAX_ARCHIVE = 4 * 1024**3
REGISTRY_IMAGE = 'ghcr.io/lrmcorp/lrmsocmedauto'


def run(args, *, env=None, input_file=None, output_file=None, capture=False, timeout=1200, progress=False):
    if args[0] == 'docker':
        args = ['docker', '--host=unix:///var/run/docker.sock', *args[1:]]
        env = (env or os.environ).copy()
        for name in ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']:
            env.pop(name, None)
    result = subprocess.run(args, env=env, stdin=input_file,
                            stdout=sys.stdout if progress else output_file or subprocess.PIPE,
                            stderr=sys.stderr if progress else subprocess.PIPE,
                            check=False, timeout=timeout)
    if result.returncode:
        # No environment dumps, rendered Compose configuration, or token logs.
        raise RuntimeError(f'{args[0]} failed (exit {result.returncode}); inspect project services locally')
    return result.stdout.decode().strip() if capture else result


def setting(name):
    for line in (SHARED / '.env').read_text().splitlines():
        if line.startswith(name + '='):
            return line.split('=', 1)[1].strip().strip('"\'')
    raise RuntimeError(f'Missing setting: {name}')


def compose(tag, *args, **kwargs):
    env = os.environ.copy()
    env['IMAGE_TAG'] = tag
    return run(['docker', 'compose', '--project-name', PROJECT, '--env-file', str(SHARED / '.env'),
                '-f', str(SHARED / 'compose.yaml'), *args], env=env, **kwargs)


def validate_archive(archive, tag):
    """Reject other image tags before touching Docker's global image store."""
    with tarfile.open(archive, 'r:gz') as bundle:
        total = 0
        count = 0
        for member in bundle:
            total += member.size
            count += 1
            if total > 12 * 1024**3 or count > 50000:
                raise RuntimeError('Expanded image archive is too large')
        member = bundle.getmember('manifest.json')
        if member.size > 65536 or not member.isfile():
            raise RuntimeError('Invalid image manifest')
        manifests = json.load(bundle.extractfile(member))
        if len(manifests) != 1 or manifests[0].get('RepoTags') != [f'{PROJECT}:{tag}']:
            raise RuntimeError('Only the exact lrmsosmed image tag is permitted')
        config_name = manifests[0]['Config']
        config_member = bundle.getmember(config_name)
        if config_member.size > 1024**2 or not config_member.isfile():
            raise RuntimeError('Invalid image configuration')
        config = json.load(bundle.extractfile(config_member))
        labels = config.get('config', {}).get('Labels', {})
        if labels.get('org.opencontainers.image.revision') != tag:
            raise RuntimeError('Image revision does not match deployment request')
        if labels.get('org.opencontainers.image.source') != 'https://github.com/lrmcorp/lrmsocmedauto':
            raise RuntimeError('Unexpected image source')
        return total


def receive(tag):
    driver = run(['docker', 'info', '--format', '{{.Driver}}'], capture=True)
    if driver not in ['overlay2', 'overlayfs']:
        raise RuntimeError('Inspect the VPS Docker storage driver before loading large images; no daemon changes are made')
    free = shutil.disk_usage(ROOT).free
    if free < 8 * 1024**3:
        raise RuntimeError('At least 8 GiB of free disk space is required; no automatic global cleanup is performed')
    fd, filename = tempfile.mkstemp(prefix=f'{tag}-', suffix='.tar.gz', dir=ROOT / 'incoming')
    archive = Path(filename)
    try:
        size = 0
        with os.fdopen(fd, 'wb') as output:
            while chunk := sys.stdin.buffer.read(1024**2):
                size += len(chunk)
                if size > MAX_ARCHIVE or size > free - 6 * 1024**3:
                    raise RuntimeError('Image archive exceeds the safe disk limit')
                output.write(chunk)
        expanded = validate_archive(archive, tag)
        if shutil.disk_usage(ROOT).free < expanded + 3 * 1024**3:
            raise RuntimeError('Not enough space to load this image without endangering other applications')
        with archive.open('rb') as source:
            run(['docker', 'load'], input_file=source)
    finally:
        archive.unlink(missing_ok=True)


def healthy(tag, timeout=300):
    deadline = time.monotonic() + timeout
    port = int(setting('APP_PORT'))
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    while time.monotonic() < deadline:
        try:
            state = compose(tag, 'ps', '--all', '--format', 'json', 'app', capture=True)
            data = json.loads(state)
            if isinstance(data, list):
                data = data[0] if data else {}
            if data.get('Health') == 'healthy':
                with opener.open(f'http://127.0.0.1:{port}/healthz', timeout=15) as response:
                    if response.status == 200 and json.load(response).get('status') == 'ok':
                        return True
        except (ValueError, OSError, RuntimeError):
            pass
        time.sleep(5)
    return False


def backup(tag):
    database_size = int(compose(tag, 'exec', '-T', 'postgres', 'psql', '-U', PROJECT, '-d', PROJECT,
                                '-Atc', 'SELECT pg_database_size(current_database())', capture=True))
    media_size = sum(path.stat().st_size for path in (SHARED / 'uploads').rglob('*')
                     if not path.is_symlink() and path.is_file())
    if shutil.disk_usage(ROOT).free < database_size * 2 + media_size * 1.1 + 3 * 1024**3:
        raise RuntimeError('Not enough space for a project backup while keeping 3 GiB free for other services')
    directory = ROOT / 'backups' / f'{time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())}-{tag}'
    directory.mkdir(mode=0o700)
    with (directory / 'database.dump').open('wb') as output:
        compose(tag, 'exec', '-T', 'postgres', 'pg_dump', '-U', PROJECT, '-d', PROJECT,
                '-Fc', output_file=output)
    with tarfile.open(directory / 'uploads.tar.gz', 'w:gz') as bundle:
        bundle.add(SHARED / 'uploads', arcname='uploads')
    shutil.copy2(SHARED / '.env', directory / '.env')
    shutil.copy2(SHARED / 'compose.yaml', directory / 'compose.yaml')
    (directory / 'image-tag').write_text(tag + '\n')
    print(f'Backup complete: {directory.name}', flush=True)
    return directory


def read_current():
    path = ROOT / 'current-tag'
    if path.exists():
        tag = path.read_text().strip()
        if not re.fullmatch('[0-9a-f]{40}', tag):
            raise RuntimeError('Invalid saved image tag')
        return tag
    return None


def pull_registry(tag, digest):
    deadline = time.monotonic() + 900
    if not re.fullmatch(r'sha256:[0-9a-f]{64}', digest):
        raise RuntimeError('A full registry digest is required')
    if run(['docker', 'info', '--format', '{{.Driver}}'], capture=True) not in ['overlay2', 'overlayfs']:
        raise RuntimeError('Inspect the VPS Docker storage driver before pulling images')
    if shutil.disk_usage(ROOT).free < 8 * 1024**3:
        raise RuntimeError('At least 8 GiB free space is required')
    credentials = sys.stdin.buffer.read(16385)
    if len(credentials) > 16384:
        raise RuntimeError('Invalid registry credentials')
    try:
        auth = json.loads(credentials)
        username, token = auth['username'], auth['token']
        if not re.fullmatch(r'[A-Za-z0-9-]+', username) or not isinstance(token, str) or not token or len(token) > 8192:
            raise ValueError()
    except (ValueError, KeyError, TypeError):
        raise RuntimeError('Invalid registry credentials') from None
    # Ephemeral job token; never use or overwrite the host Docker credentials.
    with tempfile.TemporaryDirectory(prefix='registry-auth-', dir=ROOT / 'incoming') as directory:
        env = os.environ.copy()
        env['DOCKER_CONFIG'] = directory
        with tempfile.TemporaryFile() as password:
            password.write(token.encode())
            password.seek(0)
            run(['docker', 'login', 'ghcr.io', '--username', username, '--password-stdin'],
                env=env, input_file=password, timeout=60)
        reference = f'{REGISTRY_IMAGE}@{digest}'
        print('Pulling pinned application image from GHCR; transfer limit 900 seconds.', flush=True)
        try:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise subprocess.TimeoutExpired('docker pull', 900)
            run(['docker', 'pull', reference], env=env, timeout=remaining, progress=True)
        except subprocess.TimeoutExpired:
            raise RuntimeError('Image pull exceeded 15 minutes; existing application was not stopped') from None
        labels = json.loads(run(['docker', 'image', 'inspect', reference, '--format', '{{json .Config.Labels}}'],
                                env=env, capture=True)) or {}
        if labels.get('org.opencontainers.image.source') != 'https://github.com/lrmcorp/lrmsocmedauto' or labels.get('org.opencontainers.image.revision') != tag:
            raise RuntimeError('Registry image source/revision does not match this project')
        run(['docker', 'tag', reference, f'{PROJECT}:{tag}'], env=env)
        print('Registry image downloaded and verified. Starting project deployment.', flush=True)


def deploy(tag, upload, digest=None, migrate=True):
    current = read_current()
    if digest:
        pull_registry(tag, digest)
    if upload:
        receive(tag)
    image = run(['docker', 'image', 'inspect', f'{PROJECT}:{tag}', '--format', '{{.Id}}'], capture=True)
    if not image:
        raise RuntimeError('Requested project image is unavailable')
    compose(tag, 'config', '--quiet')
    compose(tag, 'up', '-d', '--wait', '--wait-timeout', '300', 'postgres', 'redis', 'temporal')
    try:
        if current:
            compose(current, 'stop', '-t', '30', 'app')
            backup(current)
        # Backups precede additive migrations. Rollback only changes the image.
        if migrate:
            compose(tag, 'run', '--rm', '--no-deps', 'app', 'bash', '-c',
                    'if [ -f /app/deploy/migrate.cjs ]; then node /app/deploy/migrate.cjs; fi')
            # No --accept-data-loss, --force-reset, down -v, or global restarts.
            compose(tag, 'run', '--rm', '--no-deps', 'app', 'pnpm', 'exec', 'prisma', 'db', 'push',
                    '--schema', '/app/libraries/nestjs-libraries/src/database/prisma/schema.prisma')
        compose(tag, 'up', '-d', '--no-deps', 'app')
        if not healthy(tag):
            raise RuntimeError('New application failed readiness checks')
        temp = ROOT / '.current-tag.tmp'
        temp.write_text(tag + '\n')
        temp.replace(ROOT / 'current-tag')
        print(f'DEPLOYMENT_OK {tag}', flush=True)
    except Exception:
        if current:
            compose(current, 'up', '-d', '--no-deps', 'app')
            if healthy(current):
                print(f'Previous image resumed: {current}. Database backup is retained.', flush=True)
            else:
                print('Previous image did not recover. Use the project backup recovery guide.', flush=True)
        else:
            compose(tag, 'stop', 'app')
        raise


def main():
    os.umask(0o077)
    if os.geteuid() != 0 or not (ROOT / '.lrmsosmed-owned').is_file():
        raise RuntimeError('Run the project bootstrap first')
    command = sys.argv[1] if len(sys.argv) == 2 else ''
    match = re.fullmatch(r'(deploy|rollback) ([0-9a-f]{40})', command)
    registry = re.fullmatch(r'deploy-registry ([0-9a-f]{40}) (sha256:[0-9a-f]{64})', command)
    if command != 'status' and not match and not registry:
        raise RuntimeError('Allowed commands: status, deploy <SHA>, rollback <SHA>, deploy-registry <SHA> <digest>')
    with (ROOT / 'deploy.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if command == 'status':
            current = read_current()
            print('CURRENT_IMAGE ' + (current or 'not-deployed'))
            if current and not healthy(current, timeout=20):
                raise RuntimeError('Project is not healthy')
        elif registry:
            deploy(registry[1], upload=False, digest=registry[2])
        else:
            deploy(match[2], upload=match[1] == 'deploy', migrate=match[1] != 'rollback')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'DEPLOYMENT_FAILED: {error}', file=sys.stderr)
        sys.exit(1)
