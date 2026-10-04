# Writing a note

Notes live at https://mac-wall.com/notes/. Each note is one Markdown file; GitHub Pages
(Jekyll) turns it into a page and adds it to the list, newest first.

## The workflow

1. **Start a draft**: `_dev/note.sh new "What I learned shrinking an 83 MB download"`
   creates `_drafts/what-i-learned-shrinking-an-83-mb-download.md` from the template.
2. **Write it** in any editor. Fill in the three lines at the top:
   - `title`: shown as the heading and in the browser tab.
   - `description`: one or two sentences for the Notes list and link previews.
   - `project` (optional): `movie-dashboard`, `virtue-ledger` or `elenchus` adds a
     "Related project" link. Add new projects in `_data/projects.yml`.
3. **Preview it**: `_dev/note.sh preview`, then open http://localhost:4000/notes/.
   Drafts show up in the preview only. The site rebuilds when you save; reload the page to see it.
4. **Publish it**: `_dev/note.sh publish what-i-learned-shrinking-an-83-mb-download`
   moves it to `_posts/2026-10-04-what-i-learned-shrinking-an-83-mb-download.md`
   (today's date). Commit and push; it's live a minute later at
   `/notes/what-i-learned-shrinking-an-83-mb-download/`.

Without the script: put a file named `YYYY-MM-DD-some-title.md` in `_posts/` with the same
three lines at the top. That works from GitHub's web editor too.

## Formatting

`_drafts/example-note.md` shows everything a note can use (headings, lists, quotes, code,
tables, images with captions) and how it looks. Images go in `notes/images/`.

## Notes written by Claude

Add `author: claude` to the top lines of a note Claude drafted. The note then shows
"Written by Claude" under the title, its text is in a mono font on a faint red wash,
it gets a "Written by Claude" tag on the Notes list, and its card in the garden is
tinted red.

- **Redact** words you don't want it to say by replacing them with a bar:
  `<span class="redacted">████████</span>`. The words are gone from the file; the bar
  just shows something was cut.
- **Comment in the margin** with a quote marked as yours, just above the paragraph it's
  about. It shows beside the text in the normal font, labelled "Mac", without the tint
  (in the text itself on narrow screens):

  ```
  {:.margin-note}
  > Your comment here.
  ```

`_drafts/example-note.md` shows both.

## Good to know

- Drafts in `_drafts/` are never published, even when pushed.
- To edit a published note, edit its file in `_posts/` and push.
- To unpublish, delete the file from `_posts/` (or move it back to `_drafts/`).
- The URL comes from the file name, so renaming a published file changes its link.
- The page design is in `_layouts/` (note.html, base.html) and `notes/notes.css`.
- The feed for readers is `/notes/feed.xml`.
- First preview downloads Ruby and GitHub Pages' Jekyll into a container (about a minute);
  later previews start in seconds. Nothing is installed on the machine itself.
