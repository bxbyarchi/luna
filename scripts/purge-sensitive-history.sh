#!/usr/bin/env bash
# Purges files that were committed to this repo's history by mistake and must
# never have been public: a production DB dump with staff/customer PII, and
# several full-source zip snapshots. Removing them from the current commit
# (already done) is NOT enough — every past commit that touched them still
# has the blobs, and this repo is PUBLIC, so they're downloadable right now
# via any commit SHA or the GitHub API, regardless of what HEAD looks like.
#
# This script does NOT push. Read it, run it, inspect the result, THEN get
# explicit sign-off before the force-push step at the bottom.
#
# Prerequisites:
#   pip install git-filter-repo   (or: brew install git-filter-repo / apt install git-filter-repo)
#
# Usage:
#   ./scripts/purge-sensitive-history.sh
#
# What happens to every existing clone/fork after the force-push:
#   Every commit SHA after the affected files changes. Anyone with an
#   existing local clone (including this one, and any other machine/CI
#   runner that has cloned bxbyarchi/luna) must re-clone from scratch —
#   `git pull` will not reconcile a rewritten history and will either fail
#   or silently create a mess. There is no way around this; it is the
#   nature of history rewriting. Tell everyone with a clone (teammates, CI,
#   other Claude sessions, your own machine) to delete their local copy and
#   `git clone` again.

set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v git-filter-repo >/dev/null 2>&1; then
  echo "git-filter-repo not found. Install it first: pip install git-filter-repo" >&2
  exit 1
fi

echo "== Working on a FRESH mirror clone, not this working copy =="
WORKDIR="$(mktemp -d)"
MIRROR="$WORKDIR/luna-mirror.git"
git clone --mirror https://github.com/bxbyarchi/luna.git "$MIRROR"
cd "$MIRROR"

echo "== Stripping sensitive/large paths from all of history =="
git filter-repo \
  --path backup_database.sql --invert-paths \
  --path project.zip --invert-paths \
  --path project_part_aa --invert-paths \
  --path project_part_ab --invert-paths \
  --path project_part_ac --invert-paths \
  --path project_part_ad --invert-paths \
  --path project_part_ae --invert-paths \
  --path project_part_af --invert-paths \
  --path project_part_ag --invert-paths \
  --path СКАЧАТЬ_КОД --invert-paths \
  --path artifacts/m-sklad/public/code_clean.zip --invert-paths

echo
echo "== Done rewriting. Inspect before pushing: =="
echo "  cd $MIRROR"
echo "  git log --oneline | head -20"
echo "  git log --all --oneline -- backup_database.sql   # should be empty"
echo
echo "== To finish (ONLY after you've reviewed the above and confirmed): =="
echo "  cd $MIRROR"
echo "  git remote set-url origin https://github.com/bxbyarchi/luna.git"
echo "  git push --force --all"
echo "  git push --force --tags"
echo
echo "== After the force-push, on EVERY machine/session with a clone: =="
echo "  rm -rf luna && git clone https://github.com/bxbyarchi/luna.git"
echo "  (git pull will NOT work on a rewritten history)"
