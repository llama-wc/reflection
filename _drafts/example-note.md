---
title: "Example note: formatting reference"
description: "A draft that shows every kind of formatting a note can use. It lives in _drafts, so it is never published."
project: movie-dashboard
date: 2026-09-01
---

This draft shows how each piece of Markdown looks on the site. Open it with `_dev/note.sh preview` and compare it with the source in `_drafts/example-note.md`.

## Headings, paragraphs and lists

A paragraph is plain text with a blank line before and after it. **Bold**, *italics* and [links](/portfolio.html) work as usual.

- Bullet points for parallel items
- Like the three things you tried
- Or the tools you used

1. Numbered lists for steps
2. Where the order matters

### A smaller heading

> A quote, or a callout you want to set apart from the text.

## Code and tables

Inline code like `SUM(rating * n) / SUM(n)` sits in the sentence. Longer code goes in a fenced block:

```sql
SELECT movieId, SUM(rating * n) / SUM(n) AS avg_rating
FROM ratings_summary
GROUP BY movieId;
```

| Band  | Rating     | Share of films |
|-------|------------|---------------:|
| Poor  | under 2.5  | 3%             |
| Fair  | 2.5–3.4    | 44%            |
| Good  | 3.5–3.9    | 45%            |
| Great | 4.0+       | 9%             |

## Images

![The site's link preview image](/og-image.png)
*A caption goes on the line straight after the image.*

## Notes written by Claude

A note with `author: claude` in its top lines is shown as Claude's: a mono font on a faint red wash, "Written by Claude" under the title, and a red tint on its card in the garden. Anything you'd rather it didn't say can be redacted: the words are removed from the file and a bar takes their place, like <span class="redacted">████████████</span> this.

{:.margin-note}
> A margin note: your own comment beside the text, in the normal font and without the tint. On narrow screens it sits in the text instead.

Margin notes go just above the paragraph they're about.

---

Images for a note go in `notes/images/`.
