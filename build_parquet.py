import polars as pl
import requests
import zipfile
import io
import os
import sys
import time

# 1. SECURE API KEY FROM GITHUB SECRETS
# Accepts either a v3 API key or a v4 read access token.
TMDB_API_KEY = os.getenv("TMDB_API_KEY")
TMDB_BASE = "https://api.themoviedb.org/3"

# ml-latest is the rolling MovieLens release the dashboard was built on.
# (ml-25m is a frozen 2019 snapshot and drops every movie released since.)
ML_URL = "https://files.grouplens.org/datasets/movielens/ml-latest.zip"
ML_DIR = "raw_data/ml-latest"

# Only the most-rated movies get TMDB metadata; keeps movies.parquet small.
TOP_N_MOVIES = 2500
CAST_SIZE = 3
MISSING = "N/A"
META_COLS = ["director", "cast", "studio", "runtime", "description"]
MOVIE_COLS = ["movieId", "title_clean", "release_year", "genres", *META_COLS]

session = requests.Session()
if TMDB_API_KEY and TMDB_API_KEY.startswith("eyJ"):
    session.headers["Authorization"] = f"Bearer {TMDB_API_KEY}"
elif TMDB_API_KEY:
    session.params = {"api_key": TMDB_API_KEY}


def tmdb_get(path, **params):
    """GET a TMDB endpoint, backing off on rate limits. Returns None on 404."""
    for attempt in range(5):
        res = session.get(f"{TMDB_BASE}{path}", params=params, timeout=20)
        if res.status_code == 429:
            time.sleep(int(res.headers.get("Retry-After", 2 ** attempt)))
            continue
        if res.status_code == 404:
            return None
        res.raise_for_status()
        return res.json()
    raise RuntimeError(f"TMDB kept rate limiting {path}")


def parse_details(d, kind):
    """Flatten a TMDB movie/tv response (with credits) into dashboard columns."""
    credits = d.get("credits", {})
    if kind == "movie":
        directors = [c["name"] for c in credits.get("crew", []) if c.get("job") == "Director"]
        runtime = d.get("runtime")
        date = d.get("release_date")
    else:
        directors = [c["name"] for c in d.get("created_by", [])]
        runtime = (d.get("episode_run_time") or [None])[0]
        date = d.get("first_air_date")
    cast = [c["name"] for c in credits.get("cast", [])[:CAST_SIZE]]
    studios = d.get("production_companies") or d.get("networks") or []
    return {
        "director": ", ".join(directors[:2]) or MISSING,
        "cast": ", ".join(cast) or MISSING,
        "studio": studios[0]["name"] if studios else MISSING,
        "runtime": f"{runtime} min" if runtime else MISSING,
        "description": d.get("overview") or MISSING,
        "tmdb_year": date[:4] if date else None,
    }


def enrich_with_tmdb(tmdb_id, imdb_id):
    """Look up a movie by its TMDB id, falling back to its IMDb id.

    links.csv has a handful of stale TMDB ids (and some entries are TV
    series), so when the direct lookup fails we ask TMDB's /find endpoint.
    """
    if tmdb_id is not None:
        d = tmdb_get(f"/movie/{tmdb_id}", append_to_response="credits")
        if d:
            return parse_details(d, "movie")
    if imdb_id is not None:
        found = tmdb_get(f"/find/tt{imdb_id:07d}", external_source="imdb_id")
        for kind in ("movie", "tv"):
            hits = (found or {}).get(f"{kind}_results") or []
            if hits:
                d = tmdb_get(f"/{kind}/{hits[0]['id']}", append_to_response="credits")
                if d:
                    return parse_details(d, kind)
    return None


def is_complete(row):
    return row["release_year"] is not None and all(row[c] not in (MISSING, "Unknown", "", None) for c in META_COLS)


def main():
    if not TMDB_API_KEY:
        # Without enrichment we'd overwrite movies.parquet with bare MovieLens
        # rows and break the dashboard, so fail before touching any files.
        sys.exit("❌ TMDB_API_KEY is not set; refusing to rebuild the Parquet files.")

    print("🚀 Starting Data Pipeline...")

    # DOWNLOAD AND EXTRACT RAW DATA
    print(f"Downloading {ML_URL}...")
    response = requests.get(ML_URL, timeout=600)
    response.raise_for_status()

    print("Extracting files...")
    with zipfile.ZipFile(io.BytesIO(response.content)) as z:
        z.extractall("raw_data")

    # 2. PROCESS RATINGS
    print("Processing Ratings Data...")
    ratings_df = pl.read_csv(f"{ML_DIR}/ratings.csv").with_columns(
        pl.from_epoch("timestamp", time_unit="s").dt.year().alias("review_year")
    )
    ratings_parquet = ratings_df.select(["movieId", "rating", "review_year"])

    # 3. PROCESS & ENRICH MOVIES
    print("Processing Movie Metadata...")
    top_ids = (
        ratings_parquet.group_by("movieId").len()
        .sort(["len", "movieId"], descending=[True, False])
        .head(TOP_N_MOVIES)
        .select("movieId")
    )
    movies_df = (
        pl.read_csv(f"{ML_DIR}/movies.csv")
        .join(top_ids, on="movieId")
        .join(pl.read_csv(f"{ML_DIR}/links.csv", schema_overrides={"imdbId": pl.Int64, "tmdbId": pl.Int64}), on="movieId", how="left")
        .with_columns(
            pl.col("title").str.replace(r"\s*\(\d{4}\)\s*$", "").str.strip_chars().alias("title_clean"),
            pl.col("title").str.extract(r"\((\d{4})\)\s*$").alias("release_year"),
        )
        .sort("movieId")
    )

    # Reuse metadata from the previous build so reruns only call TMDB for
    # new movies or ones that came back incomplete last time.
    cache = {}
    if os.path.exists("movies.parquet"):
        prev = pl.read_parquet("movies.parquet")
        if set(MOVIE_COLS) <= set(prev.columns):
            cache = {r["movieId"]: r for r in prev.iter_rows(named=True) if is_complete(r)}

    rows, fetched, failed = [], 0, []
    for m in movies_df.iter_rows(named=True):
        row = {c: m.get(c) for c in MOVIE_COLS}
        if m["movieId"] in cache:
            cached = cache[m["movieId"]]
            row.update({c: cached[c] for c in META_COLS})
            row["release_year"] = row["release_year"] or cached["release_year"]
        else:
            meta = enrich_with_tmdb(m["tmdbId"], m["imdbId"])
            fetched += 1
            if meta is None:
                failed.append(m["title"])
                meta = {c: MISSING for c in META_COLS} | {"tmdb_year": None}
            row["release_year"] = row["release_year"] or meta.pop("tmdb_year")
            meta.pop("tmdb_year", None)
            row.update(meta)
        rows.append(row)

    enriched = pl.DataFrame(rows, schema={
        "movieId": pl.Int64, "title_clean": pl.String, "release_year": pl.String, "genres": pl.String,
        **{c: pl.String for c in META_COLS},
    })
    print(f"Fetched {fetched} movies from TMDB ({len(rows) - fetched} reused from the previous build).")
    if failed:
        print(f"⚠️ No TMDB match for {len(failed)}: {', '.join(failed)}")

    # Sanity check before overwriting the files the live site reads.
    missing_director = enriched.filter(pl.col("director") == MISSING).height
    if missing_director > len(rows) * 0.02:
        sys.exit(f"❌ {missing_director} of {len(rows)} movies have no director; not writing output.")

    # zstd keeps ratings.parquet under GitHub's 100MB file limit
    ratings_parquet.write_parquet("ratings.parquet", compression="zstd")
    enriched.write_parquet("movies.parquet", compression="zstd")

    print("✅ Parquet generation complete. Files ready for DuckDB.")


if __name__ == "__main__":
    main()
