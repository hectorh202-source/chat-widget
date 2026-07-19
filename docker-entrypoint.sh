#!/bin/sh
set -e

# Runs once as root before dropping to the unprivileged "node" user — ensures
# the /data volume (widget.db, .encryption.key) is writable by that user on
# every start, so a redeploy never breaks on a stale root-owned volume.
mkdir -p /data
chown -R node:node /data

exec gosu node "$@"
