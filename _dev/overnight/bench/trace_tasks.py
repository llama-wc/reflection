"""List a saved trace's long main-thread tasks and what took the time inside each.

    .venv/bin/python trace_tasks.py out/trace.json [min_ms]
"""
import collections
import json
import sys

t = json.load(open(sys.argv[1]))
ev = t["traceEvents"] if isinstance(t, dict) else t
min_ms = float(sys.argv[2]) if len(sys.argv) > 2 else 50
names = {(e["pid"], e["tid"]): e["args"]["name"] for e in ev if e.get("ph") == "M" and e.get("name") == "thread_name"}
main = [e for e in ev if e.get("ph") == "X" and "dur" in e and names.get((e["pid"], e["tid"])) == "CrRendererMain"]
main.sort(key=lambda e: (e["ts"], -e["dur"]))
t0 = main[0]["ts"]
tops, end = [], 0
for e in main:
    if e["ts"] >= end:
        tops.append(e)
        end = e["ts"] + e["dur"]
for top in tops:
    if top["dur"] < min_ms * 1000:
        continue
    inside = [e for e in main if top["ts"] <= e["ts"] and e["ts"] + e["dur"] <= top["ts"] + top["dur"] and e is not top]
    c = collections.Counter()
    for e in inside:
        c[e["name"]] += e["dur"] / 1000
    print(f"{(top['ts'] - t0) / 1000:7.0f} ms  {top['dur'] / 1000:5.0f} ms  " + ", ".join(f"{n} {v:.0f}" for n, v in c.most_common(6)))
