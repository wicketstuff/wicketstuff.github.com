#!/usr/bin/env bash
# Copies the documentation from wicketstuff/core into this site.
#
# The long-term support (LTS) line is the site's main documentation; the
# newest feature line is published next to it:
#   LTS branch      <module>/docs/**  ->  modules/<name>/          (<name> = directory without "-parent")
#                   docs/**           ->  contribute/              (without docs/removed/)
#   current branch  <module>/docs/**  ->  current/modules/<name>/
#                                         modules/<name>/          (modules not on the LTS branch)
#   both branches   docs/removed/<name>/**  ->  modules/<name>/    (modules on neither branch; current first)
#   both branches                     ->  _data/core.yml           (labels and refs for the layouts)
# A removed module keeps its docs in docs/removed/<name>/ with removed_in,
# last_release and optionally replacement in the front matter of index.md;
# its page stays at /modules/<name>/ with a banner and is listed under
# "Removed modules" instead of in the catalog.
#
# Then scripts/release-lines.sh generates the release-line pages and the
# module availability data.
#
# The LTS branch comes from releases.lts.branch in _config.yml (override with
# LTS_REF). The current feature branch is the highest wicket-N.x branch in
# wicketstuff/core (override with CURRENT_REF); when it is the LTS branch,
# no extra version is published.
#
# Usage:
#   scripts/fetch-docs.sh                                clone both branches from GitHub
#   scripts/fetch-docs.sh path/to/core [path/to/core2]   use local checkouts (LTS, then current)
set -euo pipefail

site="$(cd "$(dirname "$0")/.." && pwd)"
repo="https://github.com/wicketstuff/core.git"

lts_ref="${LTS_REF:-$(awk '/^releases:/ { r = 1; next } r && /^[^ ]/ { r = 0 }
  r && /^  lts:/ { l = 1; next } r && /^  [^ ]/ { l = 0 }
  l && /^    branch:/ { print $2; exit }' "$site/_config.yml")}"
if [ -z "$lts_ref" ]; then
  echo "No releases.lts.branch in _config.yml and no LTS_REF set." >&2
  exit 1
fi
current_ref="${CURRENT_REF:-}"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

checkout() { # <ref> <local path or empty> -> prints the directory to read from
  if [ -n "$2" ]; then
    echo "$2"
  else
    git clone --quiet --depth 1 --branch "$1" "$repo" "$tmp/$1"
    echo "$tmp/$1"
  fi
}

label() { # wicket-10.x -> 10.x; other refs (local preview branches) as they are
  local l
  l="$(echo "$1" | sed -n 's/^wicket-\([0-9][0-9]*\.x\)$/\1/p')"
  echo "${l:-$1}"
}

# Copies one .md file and records where it lives in core (for Source and
# Edit links). Files without front matter get some, so Jekyll renders them.
copy_page() { # <src file> <dest file> <ref> <path in core>
  awk -v ref="$3" -v path="$4" '
    NR == 1 && $0 == "---" { print; print "source_ref: " ref; print "source_path: " path; fm = 1; next }
    NR == 1 { print "---"; print "source_ref: " ref; print "source_path: " path; print "---" }
    { print }' "$1" > "$2"
}

copy_tree() { # <docs dir> <dest dir> <ref> <path of the docs dir in core> [subdirectory to skip]
  mkdir -p "$2"
  (cd "$1" && if [ -n "${5:-}" ]; then find . -path "./$5" -prune -o -type f -print; else find . -type f; fi) | while read -r f; do
    f="${f#./}"
    mkdir -p "$2/$(dirname "$f")"
    case "$f" in
      *.md) copy_page "$1/$f" "$2/$f" "$3" "$4/$f" ;;
      *) cp "$1/$f" "$2/$f" ;;
    esac
  done
}

copy_modules() { # <core checkout> <dest dir> <ref> [only-new] -> prints the number of modules
  local count=0
  for docs in "$1"/*/docs; do
    [ -f "$docs/index.md" ] || continue
    local dir name
    dir="$(basename "$(dirname "$docs")")"
    name="${dir%-parent}"
    [ -n "${4:-}" ] && [ -e "$2/$name" ] && continue
    copy_tree "$docs" "$2/$name" "$3" "$dir/docs"
    count=$((count + 1))
  done
  echo "$count"
}

copy_removed() { # <core checkout> <dest dir> <ref> -> prints the number of modules
  local count=0
  for docs in "$1"/docs/removed/*; do
    [ -f "$docs/index.md" ] || continue
    local name
    name="$(basename "$docs")"
    [ -e "$2/$name" ] && continue
    copy_tree "$docs" "$2/$name" "$3" "docs/removed/$name"
    count=$((count + 1))
  done
  echo "$count"
}

rm -rf "$site/modules" "$site/contribute" "$site/current"
mkdir -p "$site/_data"

lts_src="$(checkout "$lts_ref" "${1:-}")"
lts_count="$(copy_modules "$lts_src" "$site/modules" "$lts_ref")"
if [ "$lts_count" -lt 10 ]; then
  echo "Only $lts_count module docs found on $lts_ref; refusing to build a site without them." >&2
  exit 1
fi
[ -d "$lts_src/docs" ] && copy_tree "$lts_src/docs" "$site/contribute" "$lts_ref" "docs" removed
echo "Copied docs for $lts_count modules from wicketstuff/core $lts_ref (LTS)."

if [ -z "$current_ref" ] && [ -z "${2:-}" ]; then
  current_ref="$(git ls-remote --heads "$repo" 'wicket-*.x' | sed -n 's#.*refs/heads/##p' | sort -V | tail -n 1)"
fi
if [ -n "${2:-}" ] && [ -z "$current_ref" ]; then
  current_ref="$(git -C "$2" rev-parse --abbrev-ref HEAD)"
fi

if [ -n "$current_ref" ] && [ "$current_ref" != "$lts_ref" ]; then
  current_src="$(checkout "$current_ref" "${2:-}")"
  current_count="$(copy_modules "$current_src" "$site/current/modules" "$current_ref")"
  echo "Copied docs for $current_count modules from wicketstuff/core $current_ref (current)."
  new_count="$(copy_modules "$current_src" "$site/modules" "$current_ref" only-new)"
  if [ "$new_count" -gt 0 ]; then echo "Published $new_count modules that are only on $current_ref under modules/."; fi
  removed_count="$(copy_removed "$current_src" "$site/modules" "$current_ref")"
  if [ "$removed_count" -gt 0 ]; then echo "Copied docs for $removed_count removed modules from $current_ref docs/removed/."; fi
else
  current_ref=""
fi
removed_count="$(copy_removed "$lts_src" "$site/modules" "$lts_ref")"
if [ "$removed_count" -gt 0 ]; then echo "Copied docs for $removed_count removed modules from $lts_ref docs/removed/."; fi

{
  echo "lts_ref: \"$lts_ref\""
  echo "lts_label: \"$(label "$lts_ref")\""
  if [ -n "$current_ref" ]; then
    echo "current_ref: \"$current_ref\""
    echo "current_label: \"$(label "$current_ref")\""
  fi
} > "$site/_data/core.yml"

"$site/scripts/release-lines.sh"
