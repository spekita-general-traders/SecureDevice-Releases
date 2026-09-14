#!/usr/bin/env bash
set -euo pipefail

# Treat the release event/API result as data, never shell source. The publisher
# strips an optional v; the remaining version uses the manifest's version form.
if [ "$#" -ne 1 ] || [[ ! "$1" =~ ^v?[0-9][A-Za-z0-9._-]*$ ]]; then
  printf '%s\n' 'Invalid release tag' >&2
  exit 1
fi
