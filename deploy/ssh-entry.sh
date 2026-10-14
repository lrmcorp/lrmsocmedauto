#!/usr/bin/env bash
set -euo pipefail
exec sudo -n -- /usr/local/sbin/lrmsosmed-receiver "${SSH_ORIGINAL_COMMAND:-}"
