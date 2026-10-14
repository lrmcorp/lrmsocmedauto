#!/usr/bin/env bash
set -euo pipefail
mode=${1:-}
tag=${2:-}
[[ "$mode" == deploy || "$mode" == rollback || "$mode" == status ]] || { printf 'Unsupported SSH operation\n' >&2; exit 1; }
if [[ "$mode" != status ]]; then
  [[ "$tag" =~ ^[0-9a-f]{40}$ ]] || { printf 'A full commit SHA is required\n' >&2; exit 1; }
fi
for name in VPS_HOST VPS_PORT VPS_USER VPS_SSH_KEY VPS_KNOWN_HOSTS; do
  [[ -n "${!name:-}" ]] || { printf 'Missing GitHub Actions Secret: %s\n' "$name" >&2; exit 1; }
done
[[ "$VPS_HOST" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ && "$VPS_USER" =~ ^[a-zA-Z_][a-zA-Z0-9_-]*$ ]] || exit 1
[[ "$VPS_USER" == deploy-lrmsosmed ]] || {
  printf 'VPS_USER must be the dedicated deploy-lrmsosmed account; other project users are not permitted\n' >&2; exit 1;
}
[[ "$VPS_PORT" =~ ^[0-9]{1,5}$ ]] && ((10#$VPS_PORT > 0 && 10#$VPS_PORT < 65536)) || exit 1
umask 077
directory=$(mktemp -d)
trap 'rm -rf "$directory"' EXIT
printf '%s\n' "$VPS_SSH_KEY" > "$directory/key"
printf '%s\n' "$VPS_KNOWN_HOSTS" > "$directory/known_hosts"
ssh-keygen -y -f "$directory/key" > /dev/null
ssh-keygen -F "[$VPS_HOST]:$VPS_PORT" -f "$directory/known_hosts" > /dev/null || {
  printf 'VPS_KNOWN_HOSTS does not contain the verified host and port\n' >&2; exit 1;
}
ssh_options=(-F /dev/null -i "$directory/key" -p "$VPS_PORT" -o BatchMode=yes
  -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$directory/known_hosts"
  -o ConnectTimeout=15 -o ServerAliveInterval=30 -o ServerAliveCountMax=4 -T)
if [[ "$mode" == deploy ]]; then
  docker save "lrmsosmed:$tag" | gzip -1 | ssh "${ssh_options[@]}" "$VPS_USER@$VPS_HOST" "deploy $tag"
elif [[ "$mode" == rollback ]]; then
  ssh "${ssh_options[@]}" "$VPS_USER@$VPS_HOST" "rollback $tag" < /dev/null
else
  ssh "${ssh_options[@]}" "$VPS_USER@$VPS_HOST" status < /dev/null
fi
