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
- [ ] Check the first scheduled data refresh (Sun 2026-10-04) succeeds and doesn't
      commit unchanged parquet files every week (ratings_full is 81MB of history each time).
- [ ] Idea: the trend chart's "violin" width is drawn from yearly review count, not
      the actual rating spread. ratings_summary.parquet keeps per-star counts, so a real
      distribution (or a star histogram) is possible.
- [ ] "Untitled Spider-Man Reboot" is MovieLens's title; TMDB calls it
      *Spider-Man: Homecoming*.
- [ ] Planet Earth, Band of Brothers, Spellbound still have N/A fields (TMDB lacks the data).

## Site
- [ ] `mac-wall.com/elenchus/` is a broken copy (chat calls 405 on GitHub Pages); the
      real app is elenchus.mac-wall.com. Exclude `elenchus/` and `functions/` from the
      Pages build via `_config.yml`.
