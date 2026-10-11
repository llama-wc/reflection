#!/bin/bash
# Benchmark the working tree as it is now, over every board and CPU speed:
#     ./run.sh LABEL [runs] [boards...]
# The site is first copied (cheaply, as a reflink) to out/tree-LABEL, so the code can be
# edited while it runs. A summary of each board and speed goes in runs/LABEL.txt.
cd "$(dirname "$0")"
label=$1; runs=${2:-3}; shift 2; boards=${*:-small n150 n400}
repo=$(git rev-parse --show-toplevel)
tree=out/tree-$label
rm -rf "$tree" "$tree-boards"; mkdir -p "$tree"
for f in "$repo"/*; do
  case $(basename "$f") in _dev|_drafts|_site) ;; *) cp -r --reflink=auto "$f" "$tree/" ;; esac
done
export BENCH_ROOT=$tree BENCH_BOARDS=$tree-boards
.venv/bin/python build.py > /dev/null
: > runs/$label.txt
for board in $boards; do
  for cpu in 1 4; do
    .venv/bin/python bench.py "$label" --board $board --cpu $cpu --runs $runs >> runs/$label.txt 2>&1
    grep -v '^  ' runs/$label.txt | tail -1
  done
done
