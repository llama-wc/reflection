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

---

Images for a note go in `notes/images/`.
