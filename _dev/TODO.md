# mac-wall.com TODO

## Movie dashboard
- [x] Shrink the dashboard's 83MB download: charts now run on ratings_summary.parquet
      (3MB, counts per movie/year/rating, identical numbers).
- [x] Raw records table: ratings_full.parquet (81MB, all 33.8M ratings with user + date)
      streams in the background (button on phones) and is queried live.
- [ ] Idea: per-user view could show that user's rating histogram / taste profile.
- [x] Supplement post-July-2023 films from TMDB (top 500 by votes, refreshed weekly),
      shown with TMDB score + source labels; never mixed into MovieLens averages.
- [ ] After the first real supplement run, sanity-check a few TMDB rows (genres,
      director, scores) and that The Odyssey appears.
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
