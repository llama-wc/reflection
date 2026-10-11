#!/bin/bash
# Run the benchmark for one label over every board and CPU speed: ./matrix.sh LABEL [runs]
# A summary of each goes in runs/LABEL.txt.
cd "$(dirname "$0")"
label=$1; runs=${2:-3}
: > runs/$label.txt
for board in small n150 n400; do
  for cpu in 1 4; do
    .venv/bin/python bench.py "$label" --board $board --cpu $cpu --runs $runs 2>&1 | tee -a runs/$label.txt | head -1
  done
done
