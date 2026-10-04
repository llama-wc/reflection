#!/usr/bin/env bash
# Notes helper. Run from anywhere inside the repo:
#
#   _dev/note.sh new "My note title"   start a draft in _drafts/
#   _dev/note.sh preview               preview the site (drafts included) at http://localhost:4000/notes/
#   _dev/note.sh publish my-note-title move a draft into _posts/ with today's date
#   _dev/note.sh list                  show drafts and published notes
#
# Drafts are never published. A note goes live once it is in _posts/ and pushed to main.
set -euo pipefail
cd "$(dirname "$0")/.."

slugify() {
    echo "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g'
}

case "${1:-}" in
    new)
        title="${2:?Usage: _dev/note.sh new \"Note title\"}"
        slug="$(slugify "$title")"
        file="_drafts/$slug.md"
        mkdir -p _drafts
        [[ -e "$file" ]] && { echo "Already exists: $file"; exit 1; }
        # Insert the title as-is (quotes escaped for the YAML front matter)
        python3 -c 'import sys; t = sys.argv[1].replace("\\", "\\\\").replace("\"", "\\\""); sys.stdout.write(open("_dev/note-template.md").read().replace("TITLE", t, 1))' "$title" > "$file"
        echo "Created $file"
        echo "Preview with: _dev/note.sh preview"
        ;;
    publish)
        slug="${2:?Usage: _dev/note.sh publish <draft-name>}"
        slug="${slug%.md}"; slug="${slug#_drafts/}"
        draft="_drafts/$slug.md"
        [[ -f "$draft" ]] || { echo "No draft at $draft"; exit 1; }
        mkdir -p _posts
        post="_posts/$(date +%F)-$slug.md"
        if git ls-files --error-unmatch "$draft" >/dev/null 2>&1; then git mv "$draft" "$post"; else mv "$draft" "$post"; fi
        # The publish date comes from the file name; drop any draft date in the front matter that would override it
        python3 - "$post" <<'PY'
import re, sys
path = sys.argv[1]
text = open(path).read()
head, sep, body = text.partition("\n---\n")
open(path, "w").write(re.sub(r"\ndate:[^\n]*", "", head) + sep + body)
PY
        echo "Published as $post"
        echo "It goes live at https://mac-wall.com/notes/$slug/ once you commit and push."
        ;;
    preview)
        # Runs GitHub Pages' own Jekyll setup in a container, so nothing is installed on this machine.
        # The first run downloads Ruby and the github-pages gem (a few minutes); later runs reuse them.
        echo "Starting preview at http://localhost:4000/notes/ (Ctrl+C to stop)"
        exec podman run --rm -it -p 4000:4000 --security-opt label=disable \
            -v "$PWD":/srv/site -v mac-wall-jekyll-gems:/usr/local/bundle \
            docker.io/library/ruby:3.3 sh -c '
                gem list -i github-pages >/dev/null 2>&1 || gem install --no-document github-pages webrick
                cd /srv/site && jekyll serve --drafts --host 0.0.0.0'
        ;;
    list)
        echo "Drafts:";    ls -1 _drafts/*.md 2>/dev/null | sed 's|^|  |' || true
        echo "Published:"; ls -1 _posts/*.md  2>/dev/null | sed 's|^|  |' || true
        ;;
    *)
        sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
        exit 1
        ;;
esac
