# mac-wall.com TODO

## Movie dashboard
- [x] Shrink the dashboard's 83MB download: charts now run on ratings_summary.parquet
      (3MB, counts per movie/year/rating, identical numbers).
- [x] Raw records table: ratings_full.parquet (81MB, all 33.8M ratings with user + date)
      streams in the background (button on phones) and is queried live.
- [ ] Idea: per-user view could show that user's rating histogram / taste profile.
- [x] Supplement post-July-2023 films from TMDB (top 500 by votes, refreshed weekly),
      shown with TMDB score + source labels; never mixed into MovieLens averages.
- [x] First real supplement run (2026-10-03): 500 TMDB films, all with directors;
      The Odyssey (Nolan, 8.0/10) shows under Christopher Nolan.
- [ ] Same title + year in the movie dropdown is ambiguous, e.g. two "The Odyssey (2026)"
      (Nolan's and The Asylum's). Show the director for duplicates.
- [ ] Typo-tolerant search ("Noland" -> "Did you mean Christopher Nolan?"), e.g. DuckDB
      jaro_winkler_similarity. Deferred.
- [ ] RESET button wraps onto its own line around 1160px wide.
- [x] First scheduled refresh (Sun 2026-10-04) succeeded and only committed movies.parquet
      (refreshed TMDB scores); the ratings files rebuilt byte-identical.
- [x] Replaced the red/amber/green score colours with four rating bands (coral / amber /
      soft jade / vivid jade), shared by the score square, trend chart, table and score filter.
- [ ] Idea: the trend chart's "violin" width is drawn from yearly review count, not
      the actual rating spread. ratings_summary.parquet keeps per-star counts, so a real
      distribution (or a star histogram) is possible.
- [ ] "Untitled Spider-Man Reboot" is MovieLens's title; TMDB calls it
      *Spider-Man: Homecoming*.
- [ ] Planet Earth, Band of Brothers, Spellbound still have N/A fields (TMDB lacks the data).

## Site
- Standing rule: when Home, Portfolio, the dashboard, Virtue Ledger or Elenchus change how
      they look, re-run `python3 _dev/garden-thumbs.py` and commit the new screenshots and
      `_data/garden_titles.json`. Full checklist: `_dev/UPDATING.md`.
- [x] `mac-wall.com/elenchus/` (the copy the garden embeds) got 405s from GitHub Pages; it
      now calls elenchus.mac-wall.com/api/chat directly (CORS allowed for mac-wall.com).
- Elenchus runs on Groq's `openai/gpt-oss-120b` (`functions/api/chat.js`, MODEL). Groq
      retires models; if chat breaks, check console.groq.com/docs/deprecations first.
- [ ] Add a "blog feature" that allows me to write up what I learned etc. I can link specific projects, but also just post regular entries 
- [x] Clean up the language. Less technical-sounding, more business casual

## Parking lot
Ideas that are started or researched but on hold. Each says where the work is and what's left.
When one is picked up again, move it into its section above.

- [ ] **Contact page with a message form** (parked 2026-10-05).
      Code: branch `parked/contact-page` (`git switch parked/contact-page`). It has
      `contact.html` (name / email / message, spam-bot field, sent and error states), Home's
      Email button renamed to Contact (no email address anywhere on the site), a garden
      card between Portfolio and Notes, the theme.js redirect and fresh board screenshots.
      Tested locally in Firefox and Chromium with the sender faked.
      Left to do: the form needs something to receive and deliver messages
      (`FORM_ENDPOINT` in contact.html is a placeholder). Options:
      - Preferred: a small Cloudflare Worker of our own (like `virtue-api`) that checks the
        message, only accepts mac-wall.com, and emails it to Gmail with Reply-To set to the
        sender, using Email Routing's send_email binding. Email Routing is already on for
        mac-wall.com, so no third party and no new account. Needs ~10 min in the Cloudflare
        dashboard (create the Worker, add the binding), then put its URL in FORM_ENDPOINT.
      - Quickest: Formspree (free signup, 50 messages/month; messages pass through them).
      Before merging: re-run `_dev/garden-thumbs.py` if any page changed since, and rebase
      on main (garden.js / garden.yml may have moved on).
- [ ] **Comments on notes** (idea, 2026-10-05). Same pattern as the contact form plus
      storage: the contact Worker could grow a Cloudflare D1/KV database. Alternatives:
      giscus (stored in GitHub Discussions, commenters need a GitHub account) or Disqus
      (hosted, but ads and tracking).
