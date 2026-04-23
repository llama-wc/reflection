import polars as pl
import requests
import zipfile
import io
import os

# 1. SECURE API KEY FROM GITHUB SECRETS
TMDB_API_KEY = os.getenv("TMDB_API_KEY")

print("🚀 Starting Data Pipeline...")

# DOWNLOAD AND EXTRACT RAW DATA
print("Downloading MovieLens 25M dataset (This takes about 5-10 seconds on a cloud runner)...")
ml_url = "https://files.grouplens.org/datasets/movielens/ml-25m.zip"
response = requests.get(ml_url)

print("Extracting files...")
with zipfile.ZipFile(io.BytesIO(response.content)) as z:
    z.extractall("raw_data")

ratings_path = "raw_data/ml-25m/ratings.csv"
movies_path = "raw_data/ml-25m/movies.csv"

# 2. PROCESS RATINGS
print("Processing Ratings Data...")
ratings_df = pl.read_csv(ratings_path)

ratings_df = ratings_df.with_columns(
    pl.from_epoch("timestamp", time_unit="s").dt.year().alias("review_year")
)

ratings_parquet = ratings_df.select(["movieId", "rating", "review_year"])
# THE FIX: Swapped to 'zstd' for maximum file size reduction to prevent GitHub timeout
ratings_parquet.write_parquet("ratings.parquet", compression="zstd")

# 3. PROCESS & ENRICH MOVIES
print("Processing Movie Metadata...")
movies_df = pl.read_csv(movies_path)

movies_df = movies_df.with_columns(
    pl.col("title").str.replace(r"\s*\(\d{4}\)$", "").alias("title_clean")
)

# NOTE: Add your specific TMDB API enrichment logic here!

# THE FIX: Swapped to 'zstd' compression
movies_df.write_parquet("movies.parquet", compression="zstd")

print("✅ Parquet generation complete. Files ready for DuckDB.")
