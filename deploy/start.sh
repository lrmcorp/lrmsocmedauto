#!/usr/bin/env bash
set -euo pipefail
umask 022
cd /app
nginx -t
nginx
exec pm2-runtime start /app/deploy/ecosystem.config.cjs
