import pandas as pd
import psycopg2
from psycopg2.extras import RealDictCursor
import sys

def import_stories_from_csv():
    csv_file = 'stories_202604151346.csv'
    
    # Database connection details
    db_config = {
        'host': 'localhost',
        'port': 5433,
        'database': 'postgres',
        'user': 'postgres',
        'password': 'postgres'
    }
    
    try:
        # Read CSV file
        print(f"Reading CSV file: {csv_file}")
        df = pd.read_csv(csv_file)
        print(f"Found {len(df)} rows in CSV")
        
        # Connect to PostgreSQL
        print("Connecting to PostgreSQL...")
        conn = psycopg2.connect(**db_config)
        cursor = conn.cursor()
        
        # Insert query with ON CONFLICT to avoid duplicates
        insert_query = """
        INSERT INTO stories (
            story_id, title, url, content, summary, cover_image, 
            author, category, source, published_at, fetched_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (story_id) DO NOTHING
        """
        
        inserted_count = 0
        error_count = 0
        
        # Insert each row
        for index, row in df.iterrows():
            try:
                # Handle NaN values for timestamp columns
                published_at = None if pd.isna(row['published_at']) else row['published_at']
                fetched_at = None if pd.isna(row['fetched_at']) else row['fetched_at']
                
                # Handle NaN values for other columns
                cover_image = None if pd.isna(row['cover_image']) else row['cover_image']
                
                cursor.execute(insert_query, (
                    row['story_id'],
                    row['title'],
                    row['url'],
                    row['content'],
                    row['summary'],
                    cover_image,
                    row['author'],
                    row['category'],
                    row['source'],
                    published_at,
                    fetched_at
                ))
                inserted_count += 1
                conn.commit()
                
            except Exception as e:
                print(f"Error inserting row {index + 1} (story_id: {row['story_id']}): {e}")
                error_count += 1
                conn.rollback()
                continue
        
        cursor.close()
        conn.close()
        
        print(f"\nImport Summary:")
        print(f"- Total rows processed: {len(df)}")
        print(f"- Successfully inserted: {inserted_count}")
        print(f"- Errors encountered: {error_count}")
        
    except FileNotFoundError:
        print(f"Error: CSV file '{csv_file}' not found")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    import_stories_from_csv()
