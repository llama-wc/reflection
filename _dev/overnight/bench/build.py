"""Build throwaway test boards for the transition benchmarks.

There's no Jekyll here, so this renders just enough of the site by hand: the garden
page (garden/index.html with its Liquid filled in), the Notes list and one page per
generated note. Each board goes in out/<name>/, which serve.py lays over the repo, so
the garden's own code, CSS and every other page always come from the working tree.

    .venv/bin/python build.py            (small, n150 and n400)

small: the real pages and projects with 8 notes, about what the site will have soon.
n150 / n400: 20 projects (the 3 real ones and 17 made up) and 150 / 400 notes, linked
to each other a little, like the 2026-10-10 stress test in _dev/TODO.md.
"""
import html
import json
import pathlib
import random
import shutil

import yaml

from serve import OUT, ROOT

WORDS = ("data rating score model query table filter chart median browser parquet cache layer string card "
         "board camera page frame note project habit virtue tutor question reason answer number column row "
         "window phone flight motion signal noise sample test build ship measure learn decide").split()


def sentence(rng, n=None):
    words = [rng.choice(WORDS) for _ in range(n or rng.randint(8, 18))]
    return " ".join(words).capitalize() + "."


def para(rng):
    return " ".join(sentence(rng) for _ in range(rng.randint(3, 6)))


def build(name, extra_projects, n_notes, seed=1):
    rng = random.Random(seed)
    out = OUT / name
    if out.exists():
        shutil.rmtree(out)
    garden = yaml.safe_load((ROOT / "_data" / "garden.yml").read_text())
    titles = json.loads((ROOT / "_data" / "garden_titles.json").read_text())
    projects = yaml.safe_load((ROOT / "_data" / "projects.yml").read_text())

    # Made-up projects: a region each, a card with a stock picture (a real project's)
    # and a plain page with a heading where a project page has one
    real = ["movie-dashboard", "virtue-ledger", "elenchus"]
    for k in range(extra_projects):
        pid, like = f"bench-project-{k + 1}", real[k % 3]
        garden["regions"].insert(-1, {"key": pid, "name": f"Bench project {k + 1}"})
        garden["pages"].append({"id": pid, "thumb": True, "title": f"Bench project {k + 1}", "kind": "Project",
                                "url": f"/bench/{pid}.html", "region": pid, "description": "A made-up project."})
        titles[pid] = titles[like]
        projects[pid] = {"name": f"Bench project {k + 1}", "url": f"/bench/{pid}.html"}
        for t in ("dark", "light"):
            dst = out / "garden" / "thumbs" / f"{pid}-{t}.jpg"
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(ROOT / "garden" / "thumbs" / f"{like}-{t}.jpg", dst)
        page = out / "bench" / f"{pid}.html"
        page.parent.mkdir(parents=True, exist_ok=True)
        page.write_text(PROJECT_PAGE.format(title=f"Bench project {k + 1}", body=para(rng)))

    # Notes: spread over the projects and "thinking out loud", oldest first
    keys = [r["key"] for r in garden["regions"] if r["key"] not in ("hub", "thinking")]
    notes = []
    for i in range(n_notes):
        project = rng.choice(keys + [None, None])
        y, m, d = 2024 + i * 3 // max(n_notes, 1), 1 + (i * 7) % 12, 1 + (i * 11) % 28
        notes.append({"slug": f"bench-{i + 1:04d}", "title": sentence(rng, rng.randint(3, 7))[:-1],
                      "date": f"{y}-{m:02d}-{d:02d}", "project": project,
                      "author": "claude" if rng.random() < 0.2 else None,
                      "description": sentence(rng)})
    notes.sort(key=lambda n: n["date"])
    for n in notes:
        n["url"] = f"/notes/{n['slug']}/"
    for i, n in enumerate(notes):
        body = [f"<p>{para(rng)}</p>" for _ in range(rng.randint(3, 6))]
        for _ in range(rng.choice([0, 0, 1, 1, 2])):         # a few links to other notes
            other = rng.choice(notes)
            body.insert(rng.randint(0, len(body)), f'<p>See also <a href="{other["url"]}">{html.escape(other["title"])}</a>.</p>')
        n["html"] = "\n".join(body)
        n["previous"] = notes[i - 1] if i else None
        n["next"] = notes[i + 1] if i + 1 < len(notes) else None

    # The garden page
    src = (ROOT / "garden" / "index.html").read_text()
    src = src.split("---", 2)[2].lstrip()                      # front matter
    head, rest = src.split('"notes": [', 1)
    tail = rest.split("{%- endfor %}", 1)[1].split("]", 1)[1]
    site_posts = sorted(notes, key=lambda n: n["date"], reverse=True)   # site.posts is newest first
    note_json = ",\n".join(json.dumps({"id": n["url"], "title": n["title"], "kind": "Note", "url": n["url"],
                                       "date": n["date"], "description": n["description"], "project": n["project"],
                                       "author": n["author"], "html": n["html"]}) for n in site_posts)
    head = (head.replace("{{ site.data.garden.regions | jsonify }}", json.dumps(garden["regions"]))
                .replace("{{ site.data.garden.pages | jsonify }}", json.dumps(garden["pages"]))
                .replace("{{ site.data.garden.hub_links | jsonify }}", json.dumps(garden["hub_links"]))
                .replace("{{ site.data.garden_titles | jsonify }}", json.dumps(titles)))
    assert "{{" not in head and "{%" not in tail, "garden/index.html has Liquid this builder doesn't know"
    (out / "garden").mkdir(parents=True, exist_ok=True)
    (out / "garden" / "index.html").write_text(head + '"notes": [' + note_json + "]" + tail)

    # The Notes list and each note, in the base layout
    base = (ROOT / "_layouts" / "base.html").read_text()
    base = base.replace("{% seo title=false %}", "").replace("{% feed_meta %}", "")

    def layout(title, content):
        return (base.replace("{% if page.title %}{{ page.title }} | {% endif %}{{ site.title }}", f"{html.escape(title)} | Mac Wall")
                    .replace("{{ content }}", content))

    items = "\n".join(
        f'<li{" class=\"by-claude\"" if n["author"] == "claude" else ""}><time>{n["date"]}</time><div>'
        f'<a class="note-link" href="{n["url"]}">{html.escape(n["title"])}</a><p>{html.escape(n["description"])}</p>'
        + (f'<span class="project-chip">{projects[n["project"]]["name"]}</span>' if n["project"] else "") + "</div></li>"
        for n in site_posts)
    listing = ('<section class="notes-intro"><h1>Notes</h1><p>Write-ups on projects, the decisions behind them, '
               "and what I'm learning along the way.</p></section>"
               + (f'<section class="notes-year"><h2>All</h2><ol class="notes-list">{items}</ol></section>' if notes
                  else '<p class="empty">No notes yet. The first one is on its way.</p>'))
    (out / "notes").mkdir(parents=True, exist_ok=True)
    (out / "notes" / "index.html").write_text(layout("Notes", listing))
    for n in notes:
        proj = projects.get(n["project"]) if n["project"] else None
        nav = (f'<a href="{n["previous"]["url"]}"><span>Older</span>{html.escape(n["previous"]["title"])}</a>' if n["previous"] else "<span></span>")
        nav += (f'<a class="newer" href="{n["next"]["url"]}"><span>Newer</span>{html.escape(n["next"]["title"])}</a>' if n["next"] else "")
        article = (f'<article class="note{" by-claude" if n["author"] == "claude" else ""}"><header class="note-header">'
                   f'<h1>{html.escape(n["title"])}</h1><p class="note-meta"><time>{n["date"]}</time><span>3 min read</span>'
                   + (f'<span>Related project: <a href="{proj["url"]}">{proj["name"]}</a></span>' if proj else "")
                   + f'</p></header><div class="note-body">{n["html"]}</div>'
                   f'<nav class="note-nav" aria-label="More notes">{nav}</nav><p class="back"><a href="/notes/">← All notes</a></p></article>')
        d = out / "notes" / n["slug"]
        d.mkdir(parents=True, exist_ok=True)
        (d / "index.html").write_text(layout(n["title"], article))
    print(f"{name}: {len(garden['pages'])} pages, {n_notes} notes")


PROJECT_PAGE = """<!DOCTYPE html>
<html lang="en" data-theme="dark"><head><meta charset="UTF-8"><title>{title} | Mac Wall</title>
<script src="/theme.js"></script>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Oswald:wght@500;700&display=swap" rel="stylesheet">
<style>
:root[data-theme="dark"] {{ --bg: #121212; --text: #e0e0e0; }} :root[data-theme="light"] {{ --bg: #f4f4f4; --text: #111; }}
body {{ margin: 0; background: var(--bg); color: var(--text); font-family: Inter, sans-serif; }}
main {{ max-width: 1100px; margin: 0 auto; padding: 60px 40px; }}
h1 {{ font-family: Oswald, sans-serif; font-size: 44px; text-transform: uppercase; margin: 0 0 24px; }}
</style></head>
<body><main><h1>{title}</h1><p>{body}</p></main></body></html>
"""

if __name__ == "__main__":
    build("small", 0, 8)
    build("n150", 17, 150)
    build("n400", 17, 400)
