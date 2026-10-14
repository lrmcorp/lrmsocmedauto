#!/usr/bin/env bash
set -euo pipefail
docker() {
  env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
    docker --host=unix:///var/run/docker.sock "$@"
}
# Metadata only: never read application environments, keys, recordings, or data.
printf 'System resources\n'
uname -srm
free -h
df -h /opt
printf '\nListening ports\n'
ss -ltn
printf '\nDocker services\n'
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}'
printf '\nDocker networks\n'
docker network ls
for container in $(docker ps -q); do
  image=$(docker inspect --format '{{.Config.Image}}' "$container")
  if [[ "$image" == *nginx-proxy-manager* ]]; then
    printf '\nNginx Proxy Manager network membership\n'
    docker inspect --format '{{.Name}} {{range $name, $network := .NetworkSettings.Networks}}{{$name}}={{$network.IPAddress}} {{end}}' "$container"
    for network in $(docker inspect --format '{{range $name, $network := .NetworkSettings.Networks}}{{$name}} {{end}}' "$container"); do
      docker network inspect --format '{{.Name}} {{range .IPAM.Config}}subnet={{.Subnet}} gateway={{.Gateway}} {{end}}' "$network"
    done
  fi
done
printf '\nProject path\n'
if [[ -e /opt/lrmsosmed ]]; then
  ls -ld /opt/lrmsosmed
  [[ ! -f /opt/lrmsosmed/.lrmsosmed-owned ]] || printf 'Existing lrmsosmed marker found\n'
else
  printf '/opt/lrmsosmed does not exist\n'
fi
