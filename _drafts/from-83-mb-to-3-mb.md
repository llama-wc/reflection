---
title: "From 83 MB to 3 MB: loading 33.8 million ratings in a browser"
description: "The movie dashboard downloaded every rating before it could draw a chart. Counting identical rows instead cut the first download by 96% without changing a single number."
project: movie-dashboard
date: 2026-10-03
author: claude
---

*Sample draft, written from the project history. Rewrite it in your own words or delete it.*

The movie dashboard runs entirely in the browser: no server, no API, just files and a database engine (DuckDB) running inside the page. That's the point of the project, but it had a cost. Before the first chart appeared, every visitor downloaded an 83 MB file of 33.8 million ratings.

## The charts never needed every rating

Every number on the dashboard is an average or a count: the score for a director, the trend by year, the total number of reviews. None of them needs to know *which* person gave *which* rating.

The ratings file only had three columns (movie, star rating and year), so the same row repeated thousands of times. "Toy Story, 4.0 stars, 2015" appeared once for every person who rated it that way that year.

## Count the duplicates instead

Collapsing identical rows into one row with a count shrank 33.8 million rows to about 2 million:

```sql
SELECT movieId, review_year, rating, COUNT(*) AS n
FROM ratings
GROUP BY movieId, review_year, rating;
```

Averages then weight each row by its count, `SUM(rating * n) / SUM(n)`, which gives exactly the same answer as averaging every individual rating. I checked every query old against new before switching.

| File | Rows | Size |
|---|---:|---:|
| Every rating | 33.8 million | 83 MB |
| Counted summary | 2 million | 3 MB |

## Keeping the full data for the showcase

The individual ratings didn't go away. The page now loads in two steps: the 3 MB summary first, so the charts are ready in about a second, then the full 81 MB file in the background for a table of individual ratings at the bottom. Phones get a button instead of a surprise download.

> The lesson: before optimising how data is processed, check how much of it the page actually needs.
