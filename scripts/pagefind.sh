#!/usr/bin/env bash
# Builds the site search index: runs Pagefind on the built site and writes
# it to <site>/pagefind/, which assets/site.js loads. The Pages workflow
# runs this after the Jekyll build; run it yourself to preview search
# locally (see the maintainer notes at the top of index.html). Needs npx
# (Node.js).
#
# Usage: scripts/pagefind.sh [built site directory, default _site]
set -euo pipefail

# Pinned; update deliberately and check the search UI, which uses
# Pagefind's JavaScript API (https://pagefind.app/docs/api/).
version="1.5.2"

site="$(cd "$(dirname "$0")/.." && pwd)"
exec npx --yes "pagefind@$version" --site "${1:-$site/_site}"
