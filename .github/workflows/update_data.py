import polars as pl
import urllib.request
import zipfile
import os

def fetch_and_process_data():
    # 1. Download and extract the latest small dataset
    url = "https://files.grouplens.org/datasets/movielens/ml-latest-small.zip"
    zip_path = "ml-latest-small.zip"
    extract_dir = "movielens_data"

    print("Downloading latest MovieLens data...")
    urllib.request.urlretrieve(url, zip_path)

    print("Extracting data...")
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(extract_dir)

    # 2. Load CSV files using Polars
    print("Loading CSV files...")
    ratings_path = os.path.join(extract_dir, "ml-latest-small", "ratings.csv")
    movies_path = os.path.join(extract_dir, "ml-latest-small", "movies.csv")

    ratings = pl.read_csv(ratings_path)
    movies = pl.read_csv(movies_path)

    print("Merging data...")
    # Join ratings with movie titles
    merged_df = ratings.join(movies, on="movieId", how="inner")

    # Select only the needed columns to keep file size down
    final_df = merged_df.select(["title", "rating"])

    print("Converting to Parquet...")
    # Ensure data directory exists
    os.makedirs('data', exist_ok=True)
    parquet_path = "data/movie_reviews.parquet"
    
    # Save as Parquet, optimized for fast frontend reads
    final_df.write_parquet(parquet_path, compression='snappy')

    print(f"Success! Created {parquet_path} with {final_df.height} rows.")

if __name__ == "__main__":
    fetch_and_process_data()
