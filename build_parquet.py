import polars as pl
import requests
import os
from datetime import datetime

# 1. SECURE API KEY FROM GITHUB SECRETS
TMDB_API_KEY = os.getenv("TMDB_API_KEY")

def enrich_with_tmdb(tmdb_id):
    """
    Your custom TMDB API logic here.
    Fetches Director, Studio, Cast, Runtime, and Description.
    """
    if not TMDB_API_KEY:
        return {"director": "Unknown", "studio": "Unknown", "cast": "Unknown", "runtime": "0 min", "description": "No data"}
        
    url = f"https://api.themoviedb.org/3/movie/{tmdb_id}?api_key={TMDB_API_KEY}&append_to_response=credits"
    # ... your parsing logic returning a dictionary ...
    pass

print("🚀 Starting Data Pipeline...")

# 2. PROCESS RATINGS (Extracting the review_year for the control chart)
print("Processing Ratings Data...")
ratings_df = pl.read_csv("ratings.csv")

ratings_df = ratings_df.with_columns(
    # Convert the raw UNIX timestamp into the 'review_year' for the D3 Violin Plot
    pl.from_epoch("timestamp", time_unit="s").dt.year().alias("review_year")
)

# Keep only what the dashboard needs to save megabytes!
ratings_parquet = ratings_df.select(["movieId", "rating", "review_year"])
ratings_parquet.write_parquet("ratings.parquet", compression="snappy")


# 3. PROCESS & ENRICH MOVIES
print("Processing Movie Metadata...")
movies_df = pl.read_csv("movies.csv")

# --- Insert your TMDB mapping / apply function here to build out:
# m.title_clean, m.release_year, m.director, m.studio, m.cast, m.runtime, m.description

# Example of cleaning the title column for our fuzzy search:
movies_df = movies_df.with_columns(
    pl.col("title").str.replace(r"\s*\(\d{4}\)$", "").alias("title_clean")
)

# Save to Parquet
movies_df.write_parquet("movies.parquet", compression="snappy")

print("✅ Parquet generation complete. Files ready for DuckDB.")
