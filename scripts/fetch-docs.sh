#!/usr/bin/env bash
# Copies the documentation from wicketstuff/core into this site:
#   core/<module>/docs/**  ->  modules/<name>/   (<name> = module directory without "-parent")
#   core/docs/**           ->  contribute/
#   the core branch/tag    ->  _data/core.yml (for Source and Edit links)
# Usage:
#   scripts/fetch-docs.sh                 clone wicketstuff/core at $CORE_REF (default wicket-11.x)
#   scripts/fetch-docs.sh /path/to/core   use a local checkout, e.g. to preview your own docs
set -euo pipefail

site="$(cd "$(dirname "$0")/.." && pwd)"
ref="${CORE_REF:-wicket-11.x}"
src="${1:-}"

if [ -z "$src" ]; then
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  git clone --quiet --depth 1 --branch "$ref" https://github.com/wicketstuff/core.git "$tmp/core"
  src="$tmp/core"
else
  ref="$(git -C "$src" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "$ref")"
fi

rm -rf "$site/modules" "$site/contribute"
mkdir -p "$site/modules" "$site/_data"
printf 'ref: "%s"\n' "$ref" > "$site/_data/core.yml"

count=0
for docs in "$src"/*/docs; do
  [ -f "$docs/index.md" ] || continue
  dir="$(basename "$(dirname "$docs")")"
  name="${dir%-parent}"
  cp -R "$docs" "$site/modules/$name"
  # Tell the site where the module's source lives (used for the Source link).
  awk -v dir="$dir" 'NR == 1 && $0 == "---" { print; print "source_dir: " dir; next } { print }' \
    "$docs/index.md" > "$site/modules/$name/index.md"
  count=$((count + 1))
done

if [ -d "$src/docs" ]; then
  cp -R "$src/docs" "$site/contribute"
fi

if [ "$count" -lt 10 ]; then
  echo "Only $count module docs found in $src ($ref); refusing to build a site without them." >&2
  exit 1
fi
echo "Copied docs for $count modules from wicketstuff/core ($ref)."
