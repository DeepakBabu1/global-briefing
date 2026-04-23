import psycopg2
import re

def clean_summary(text):
    """Clean summary text by removing unwanted patterns and labels"""
    # Remove DeepSeek/Qwen </think> tags if present
    text = re.sub(r'</think>.*?</think>', '', text, flags=re.DOTALL).strip()
    
    # Remove any label lines model might still output
    label_patterns = [
        r'^(PART\s*\d+\s*[—\-:]+\s*)',
        r'^(\*\*PART\s*\d+\s*[—\-:]+\s*\*\*)',
        r'^(\*\*PART\s*\d+\s*[—\-:]+\s*\*\*)',
        r'^(HEADLINE\s*:?\s*)',
        r'^(\*\*HEADLINE\s*:?\s*\*\*)',
        r'^(BODY\s*:?\s*)',
        r'^(\*\*BODY\s*:?\s*\*\*)',
        r'^(SECTION\s*\d*\s*:?\s*)',
        r'^(SUMMARY\s*:?\s*)',
        r'^(KEY POINTS\s*:?\s*)',
        r'^(BULLET LIST\s*:?\s*)',
    ]
    
    lines = text.split('\n')
    cleaned = []
    for line in lines:
        stripped = line.strip()
        for pattern in label_patterns:
            stripped = re.sub(pattern, '', stripped, flags=re.IGNORECASE).strip()
        
        # Remove duplicate "Fast Facts" lines
        if stripped.lower() == 'fast facts' and any(l.lower() == 'fast facts' for l in cleaned):
            continue
        cleaned.append(stripped)
    
    return '\n'.join(cleaned).strip()

def scrub_database():
    """Connect to database and clean dirty summaries"""
    # Database connection details
    db_config = {
        'host': 'localhost',
        'port': 5433,
        'database': 'postgres',
        'user': 'postgres',
        'password': 'postgres'
    }
    
    try:
        # Connect to PostgreSQL
        print("Connecting to PostgreSQL...")
        conn = psycopg2.connect(**db_config)
        cursor = conn.cursor()
        
        # Find rows with "dirty" summaries containing "PART" or "HEADLINE"
        print("Finding rows with dirty summaries...")
        cursor.execute("""
            SELECT story_id, summary 
            FROM stories 
            WHERE summary LIKE '%PART%' OR summary LIKE '%HEADLINE%'
        """)
        
        dirty_rows = cursor.fetchall()
        print(f"Found {len(dirty_rows)} rows with dirty summaries")
        
        if not dirty_rows:
            print("No dirty summaries found. Database is already clean.")
            return
        
        # Update each dirty row
        updated_count = 0
        for story_id, summary in dirty_rows:
            try:
                # Apply cleaning logic
                cleaned_summary = clean_summary(summary)
                
                # Update only this specific row
                cursor.execute("""
                    UPDATE stories 
                    SET summary = %s 
                    WHERE story_id = %s
                """, (cleaned_summary, story_id))
                
                updated_count += 1
                conn.commit()
                
                print(f"Updated story_id: {story_id}")
                
            except Exception as e:
                print(f"Error updating story_id {story_id}: {e}")
                conn.rollback()
                continue
        
        cursor.close()
        conn.close()
        
        print(f"\nScrub Summary:")
        print(f"- Total dirty rows found: {len(dirty_rows)}")
        print(f"- Successfully updated: {updated_count}")
        print(f"- Errors encountered: {len(dirty_rows) - updated_count}")
        
    except Exception as e:
        print(f"Database connection error: {e}")

if __name__ == "__main__":
    scrub_database()
