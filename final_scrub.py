import psycopg2
import re

def clean_summary_final(text):
    """Comprehensive cleaning for newsletter formatting issues"""
    if not text:
        return text
    
    # Remove DeepSeek/Qwen </think> blocks
    text = re.sub(r'</think>.*?</think>', '', text, flags=re.DOTALL).strip()
    
    lines = text.split('\n')
    cleaned = []
    fast_facts_count = 0
    
    for line in lines:
        stripped = line.strip()
        
        # Remove lines starting with PART 1, PART 2, PART 3 (including bold versions)
        if re.match(r'^(\*\*)?PART\s*\d+', stripped, re.IGNORECASE):
            continue
        
        # Remove lines starting with HEADLINE: or BODY: (including bold versions)
        if re.match(r'^(\*\*)?(HEADLINE|BODY):', stripped, re.IGNORECASE):
            continue
        
        # Handle duplicate "Fast Facts" - keep only the one before bullets
        if stripped.lower() == 'fast facts':
            fast_facts_count += 1
            if fast_facts_count > 1:
                continue
            cleaned.append(stripped)
            continue
        
        cleaned.append(stripped)
    
    return '\n'.join(cleaned).strip()

def final_scrub_database():
    """Connect to database and clean all dirty summaries"""
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
        
        # Find all rows with dirty patterns
        print("Finding rows with newsletter formatting issues...")
        cursor.execute("""
            SELECT story_id, summary 
            FROM stories 
            WHERE summary ~ '(PART\s*\d+|HEADLINE:|BODY:|Fast Facts)'
            ORDER BY story_id
        """)
        
        dirty_rows = cursor.fetchall()
        print(f"Found {len(dirty_rows)} rows with formatting issues")
        
        if not dirty_rows:
            print("No formatting issues found. Database is already clean.")
            return
        
        # Update each dirty row
        updated_count = 0
        for story_id, summary in dirty_rows:
            try:
                # Apply comprehensive cleaning
                cleaned_summary = clean_summary_final(summary)
                
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
        
        print(f"\nFinal Scrub Summary:")
        print(f"- Total rows with issues: {len(dirty_rows)}")
        print(f"- Successfully updated: {updated_count}")
        print(f"- Errors encountered: {len(dirty_rows) - updated_count}")
        
    except Exception as e:
        print(f"Database connection error: {e}")

if __name__ == "__main__":
    final_scrub_database()
