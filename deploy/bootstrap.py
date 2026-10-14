#!/usr/bin/env python3
"""One-time administrator setup. Never run automatically over a shared VPS."""
import argparse
import json
import os
from pathlib import Path
import pwd
import re
import secrets
import shutil
import socket
import subprocess

ROOT = Path('/opt/lrmsosmed')
USER = 'deploy-lrmsosmed'


def create_layout(root):
    paths = [root, *(root / name for name in ['shared', 'backups', 'incoming', 'access']), root / 'shared' / 'uploads']
    if any(path.is_symlink() for path in paths):
        raise RuntimeError('Project paths must not be symlinks to another application')
    root.mkdir(mode=0o700, exist_ok=True)
    for name in ['shared', 'backups', 'incoming', 'access']:
        (root / name).mkdir(mode=0o700, exist_ok=True)
    uploads = root / 'shared' / 'uploads'
    uploads.mkdir(mode=0o755, exist_ok=True)
    # A private setup umask must not prevent the Nginx worker reading uploads.
    uploads.chmod(0o755)


def command(*args):
    env = os.environ.copy()
    if args[0] == 'docker':
        args = ('docker', '--host=unix:///var/run/docker.sock', *args[1:])
        for name in ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']:
            env.pop(name, None)
    return subprocess.check_output(args, text=True, env=env).strip()


def choose_port(preferred):
    used = set()
    containers = command('docker', 'ps', '-q').split()
    for container in containers:
        data = json.loads(command('docker', 'inspect', container))[0]
        for bindings in (data['NetworkSettings'].get('Ports') or {}).values():
            used.update(int(item['HostPort']) for item in (bindings or []))
    for port in [preferred, *range(4017, 4118)]:
        if port in used:
            continue
        with socket.socket() as sock:
            try:
                sock.bind(('127.0.0.1', port))
                return port
            except OSError:
                continue
    raise RuntimeError('No available project port found; inspect port use manually')


def main():
    parser = argparse.ArgumentParser(description='Set up only /opt/lrmsosmed and its dedicated deployment user')
    parser.add_argument('--domain', required=True, help='Full hostname, without https:// or a path')
    parser.add_argument('--npm-network', required=True, help='An existing, inspected Nginx Proxy Manager network')
    parser.add_argument('--ssh-port', type=int, default=1506)
    parser.add_argument('--preferred-port', type=int, default=4007)
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise RuntimeError('Run through sudo from the VPS administrator terminal')
    if not re.fullmatch(r'(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}', args.domain):
        raise RuntimeError('Use a complete public hostname, for example social.example.com')
    if not 1 <= args.ssh_port <= 65535 or not 1024 <= args.preferred_port <= 65535:
        raise RuntimeError('Invalid port')
    print(command('docker', 'compose', 'version'))
    if command('docker', 'info', '--format', '{{.Driver}}') not in ['overlay2', 'overlayfs']:
        raise RuntimeError('Inspect Docker storage before installing this project; no daemon changes were made')
    network = json.loads(command('docker', 'network', 'inspect', args.npm_network))[0]
    npm = []
    for container_id in network.get('Containers', {}):
        data = json.loads(command('docker', 'inspect', container_id))[0]
        if 'nginx-proxy-manager' in data['Config']['Image']:
            npm.append(data['Name'].lstrip('/'))
        if 'lrmsosmed-app' in (data['NetworkSettings']['Networks'][args.npm_network].get('Aliases') or []):
            if data['Config'].get('Labels', {}).get('com.docker.compose.project') != 'lrmsosmed':
                raise RuntimeError('The lrmsosmed-app network alias is already used by another project')
    if not npm or network.get('Internal'):
        raise RuntimeError('Select a non-internal network that actually contains Nginx Proxy Manager')
    marker = ROOT / '.lrmsosmed-owned'
    if ROOT.exists() and any(ROOT.iterdir()) and not marker.exists():
        raise RuntimeError('/opt/lrmsosmed contains unknown files; preserve and inspect them before setup')
    already_owned = marker.exists()
    if already_owned and (marker.stat().st_uid != 0 or marker.read_text() != 'lrmsosmed: lrmcorp/lrmsocmedauto\n'):
        raise RuntimeError('Unrecognized project marker; preserve existing files')
    if not already_owned:
        try:
            pwd.getpwnam(USER)
        except KeyError:
            pass
        else:
            raise RuntimeError('Deployment user already exists outside this setup; do not reuse another project user')
        for path in ['/etc/sudoers.d/lrmsosmed', '/usr/local/sbin/lrmsosmed-receiver', '/usr/local/sbin/lrmsosmed-restore', '/usr/local/lib/lrmsosmed']:
            if Path(path).exists():
                raise RuntimeError(f'Unknown existing path: {path}; inspect it before proceeding')
    os.umask(0o077)
    ssh_configuration = command('/usr/sbin/sshd', '-T').splitlines()
    ssh_ports = [int(line.split()[1]) for line in ssh_configuration if line.startswith('port ')]
    host_keys = [Path(line.split(maxsplit=1)[1] + '.pub') for line in ssh_configuration if line.startswith('hostkey ')]
    host_key = next((key for key in host_keys if key.is_file() and key.read_text().startswith('ssh-ed25519 ')), None)
    if not host_key:
        raise RuntimeError('Inspect the active SSH host key; no host key was guessed')
    if args.ssh_port not in ssh_ports:
        raise RuntimeError('The requested port is not in the active SSH configuration')
    if not re.search(rf':{args.ssh_port}\s', command('ss', '-ltn')):
        raise RuntimeError('The selected SSH port is not listening; inspect SSH configuration first')
    create_layout(ROOT)
    marker.write_text('lrmsosmed: lrmcorp/lrmsocmedauto\n')
    env_path = ROOT / 'shared' / '.env'
    if env_path.is_symlink():
        raise RuntimeError('Private configuration must not be a symlink to another project')
    if not env_path.exists():
        port = choose_port(args.preferred_port)
        env_path.write_text('\n'.join([
            f'PUBLIC_URL=https://{args.domain}', f'APP_PORT={port}', f'NPM_NETWORK={args.npm_network}',
            f'JWT_SECRET={secrets.token_hex(32)}', f'POSTGRES_PASSWORD={secrets.token_hex(24)}',
            f'TEMPORAL_POSTGRES_PASSWORD={secrets.token_hex(24)}',
            *[f'{name}=' for name in ['FACEBOOK_APP_ID','FACEBOOK_APP_SECRET','INSTAGRAM_APP_ID',
              'INSTAGRAM_APP_SECRET','THREADS_APP_ID','THREADS_APP_SECRET','TIKTOK_CLIENT_ID',
              'TIKTOK_CLIENT_SECRET','TIKTOK_BUSINESS_CLIENT_ID','TIKTOK_BUSINESS_CLIENT_SECRET']], '',
        ]))
        env_path.chmod(0o600)
    else:
        # Preserve all existing values, credentials, and uploads on repeat setup.
        values = dict(line.split('=', 1) for line in env_path.read_text().splitlines() if '=' in line and not line.startswith('#'))
        if values.get('PUBLIC_URL') != f'https://{args.domain}' or values.get('NPM_NETWORK') != args.npm_network:
            raise RuntimeError('Existing domain/network differs; private configuration was preserved')
        port = int(values['APP_PORT'])
    source = Path(__file__).resolve().parent
    shutil.copy2(source / 'compose.yaml', ROOT / 'shared' / 'compose.yaml')
    installed = Path('/usr/local/lib/lrmsosmed')
    installed.mkdir(mode=0o755, exist_ok=True)
    installed.chmod(0o755)
    shutil.copy2(source / 'receiver.py', '/usr/local/sbin/lrmsosmed-receiver')
    Path('/usr/local/sbin/lrmsosmed-receiver').chmod(0o755)
    shutil.copy2(source / 'restore.py', '/usr/local/sbin/lrmsosmed-restore')
    Path('/usr/local/sbin/lrmsosmed-restore').chmod(0o755)
    shutil.copy2(source / 'ssh-entry.sh', installed / 'ssh-entry.sh')
    (installed / 'ssh-entry.sh').chmod(0o755)
    try:
        account = pwd.getpwnam(USER)
    except KeyError:
        subprocess.run(['useradd', '--create-home', '--home-dir', '/var/lib/lrmsosmed-deploy',
                        '--shell', '/bin/bash', USER], check=True)
    account = pwd.getpwnam(USER)
    if account.pw_dir != '/var/lib/lrmsosmed-deploy':
        raise RuntimeError('Unexpected deployment user home; preserve it')
    home = Path(account.pw_dir)
    os.chown(home, 0, account.pw_gid)
    home.chmod(0o750)
    ssh_dir = home / '.ssh'
    ssh_dir.mkdir(mode=0o750, exist_ok=True)
    os.chown(ssh_dir, 0, account.pw_gid)
    ssh_dir.chmod(0o750)
    key = ROOT / 'access' / 'actions_ed25519'
    if not key.exists():
        subprocess.run(['ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-C', 'lrmsosmed-github-actions',
                        '-f', str(key)], check=True)
    public = key.with_suffix('.pub').read_text().strip()
    authorization = 'no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty,no-user-rc,command="/usr/local/lib/lrmsosmed/ssh-entry.sh" ' + public + '\n'
    authorized = ssh_dir / 'authorized_keys'
    authorized.write_text(authorization)
    os.chown(authorized, 0, account.pw_gid)
    authorized.chmod(0o640)
    sudoers = Path('/etc/sudoers.d/lrmsosmed')
    sudoers.write_text(f'Defaults:{USER} !requiretty\n{USER} ALL=(root) NOPASSWD: /usr/local/sbin/lrmsosmed-receiver *\n')
    sudoers.chmod(0o440)
    subprocess.run(['visudo', '-cf', str(sudoers)], check=True)
    known = ROOT / 'access' / 'known_hosts'
    known.write_text(f'[31.97.51.194]:{args.ssh_port} ' + ' '.join(host_key.read_text().split()[:2]) + '\n')
    marker.write_text('lrmsosmed: lrmcorp/lrmsocmedauto\n')
    print(f'Configured only {ROOT}. NPM containers: {", ".join(npm)}.')
    print('Verified NPM subnets: ' + ', '.join(item.get('Subnet', '') for item in network.get('IPAM', {}).get('Config', [])))
    print(f'Private host port selected: {port}. NPM target: http://lrmsosmed-app:5000 on {args.npm_network}.')
    print(f'SSH user: {USER}. Dedicated key and verified-local known_hosts files are in {ROOT}/access/.')
    print(f'Active Ed25519 host public key: {host_key}')
    print('No DNS, firewall, shared proxy, Docker daemon, or other application was modified.')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        raise SystemExit(str(error))
