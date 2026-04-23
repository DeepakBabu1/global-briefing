from airflow import DAG
from airflow.decorators import task
from datetime import datetime, timedelta
import requests
import time
import os
import re
import hashlib
import psycopg2

GROQ_API_KEY       = os.getenv('GROQ_API_KEY', '')
NEWSAPI_KEY        = os.getenv('NEWSAPI_KEY')  # Set in .env — never hardcode
POSTGRES_HOST      = os.getenv('POSTGRES_HOST', 'postgres')
POSTGRES_PORT      = os.getenv('POSTGRES_PORT', '5432')
POSTGRES_DB        = os.getenv('POSTGRES_DB', 'postgres')
POSTGRES_USER      = os.getenv('POSTGRES_USER', 'postgres')
POSTGRES_PASSWORD  = os.getenv('POSTGRES_PASSWORD', 'postgres')

# Change this to any date you want. Revert to dynamic when done:
# TARGET_DATE = "{{ ds }}"  (Airflow template for daily runs)
TARGET_DATE = "2026-04-12"   # ← HARDCODED: April 12

CATEGORY_QUERIES = {
    'Technology':   'technology OR AI OR software OR Apple OR Google',
    'Business':     'business OR economy OR stock market OR finance',
    'Sports':       'sports OR NFL OR NBA OR soccer OR tennis',
    'Entertainment':'entertainment OR movies OR music OR celebrity',
    'Politics':     'politics OR government OR election OR congress',
    'Health':       'health OR medicine OR disease OR FDA OR wellness',
    'Science':      'science OR space OR climate OR research OR NASA',
    'World News':   'world news OR international OR war OR diplomacy',
}


with DAG(
    dag_id='scrape_stories_newsapi',
    schedule='0 6 * * *',
    start_date=datetime(2026, 1, 1),
    catchup=False,
    max_active_runs=1,
) as dag:

    @task(retries=3, retry_delay=timedelta(minutes=5))
    def fetch_from_newsapi():
        """
        Uses NewsAPI /v2/everything to reliably fetch articles
        published on TARGET_DATE. Falls back to newspaper3k to
        grab full article text from each URL.
        """
        from newspaper import Article, Config

        np_config = Config()
        np_config.browser_user_agent = 'Mozilla/5.0'
        np_config.request_timeout = 15

        all_stories = []
        seen_urls   = set()

        for category, query in CATEGORY_QUERIES.items():
            print(f"\n[{category}] Querying NewsAPI for: {query}")

            try:
                resp = requests.get(
                    'https://newsapi.org/v2/everything',
                    params={
                        'q':          query,
                        'from':       TARGET_DATE,
                        'to':         TARGET_DATE,
                        'language':   'en',
                        'sortBy':     'relevancy',
                        'pageSize':   20,         # max per request on free tier
                        'apiKey':     NEWSAPI_KEY,
                    },
                    timeout=15,
                )
                resp.raise_for_status()
                data = resp.json()

            except Exception as e:
                print(f"  NewsAPI request failed for [{category}]: {e}")
                continue

            articles = data.get('articles', [])
            print(f"  NewsAPI returned {len(articles)} articles")

            category_count = 0
            for item in articles:
                if category_count >= 5:
                    break

                url = item.get('url', '')
                if not url or url in seen_urls:
                    continue
                seen_urls.add(url)

                title       = (item.get('title') or '').strip()
                description = (item.get('description') or '').strip()
                cover_image = item.get('urlToImage') or None
                source_name = item.get('source', {}).get('name', 'Unknown')
                author      = item.get('author') or source_name
                published   = item.get('publishedAt', '')[:19].replace('T', ' ')

                if not title:
                    continue

                # Filter out puzzle/game content
                excluded_keywords = ['connections', 'wordle', 'strands', 'crossword', 'hints', 'answer today']
                if any(word in title.lower() for word in excluded_keywords):
                    print(f"Skipping puzzle guide: {title}")
                    continue

                content = ''
                try:
                    art = Article(url, config=np_config)
                    art.download()
                    art.parse()
                    content = art.text.strip()
                    # If newspaper got a better image, prefer it
                    if not cover_image and art.top_image:
                        cover_image = art.top_image
                except Exception as e:
                    print(f"  newspaper3k failed for {url}: {e}")
                    # Fall back to NewsAPI description snippet
                    content = description

                # Skip if still too short
                if len(content) < 1400:
                    print(f"  Skipping (content too short): {title[:60]}")
                    continue

                story_id = hashlib.md5(url.encode()).hexdigest()

                all_stories.append({
                    'story_id':    story_id,
                    'title':       title,
                    'url':         url,
                    'content':     content[:3000],
                    'summary':     '',
                    'cover_image': cover_image,
                    'author':      author[:120] if author else source_name,
                    'category':    category,
                    'source':      source_name,
                    'published_at': published,
                    'fetched_at':  datetime.now(),
                })

                category_count += 1
                time.sleep(1)   # be polite

            print(f"  [{category}] kept {category_count} stories")

        print(f"\nTotal stories fetched: {len(all_stories)}")
        return all_stories


    @task(execution_timeout=timedelta(hours=2))
    def generate_summaries(stories):
        from groq import Groq
        import time
        import re

        # 1. Define helper function ONCE at the top
        def clean_summary(text):
            # Remove DeepSeek/Qwen </think> tags if present
            text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL).strip()
            # Remove any label lines the model might still output (including bold variations)
            label_patterns = [
                r'^(\*\*)?PART\s*\d+\s*[—\-:]+\s*\*?',
                r'^(\*\*)?HEADLINE\s*:?\s*\*?',
                r'^(\*\*)?BODY\s*:?\s*\*?',
                r'^(\*\*)?SECTION\s*\d*\s*:?\s*\*?',
                r'^(\*\*)?SUMMARY\s*:?\s*\*?',
                r'^(\*\*)?KEY POINTS\s*:?\s*\*?',
                r'^(\*\*)?BULLET LIST\s*:?\s*\*?',
            ]
            
            lines = text.split('\n')
            cleaned = []
            fast_facts_added = False
            
            for line in lines:
                stripped = line.strip()
                
                # Check if this is a Fast Facts line
                if stripped.lower() == 'fast facts':
                    if not fast_facts_added:
                        cleaned.append(stripped)
                        fast_facts_added = True
                    continue
                
                # Remove label patterns
                for pattern in label_patterns:
                    stripped = re.sub(pattern, '', stripped, flags=re.IGNORECASE).strip()
                
                # Only add non-empty lines
                if stripped:
                    cleaned.append(stripped)
            
            return '\n'.join(cleaned).strip()

        client = Groq(api_key=GROQ_API_KEY)
        summarized = []
        request_count = 0

        for story in stories:
            max_retries = 5
            
            for attempt in range(max_retries):
                try:
                    content_word_count = len(story['content'].split())
                    target_min = int(content_word_count * 0.5) 
                    target_max = int(content_word_count * 0.6)
                    
                    prompt = f"""
                    You are the lead writer for The Global Briefing, a premium daily newsletter in the style of Morning Brew and The Economist. Your writing is sharp, specific, and never vague.

                    SOURCE MATERIAL (use ONLY this — do not invent anything):
                    Title: {story['title']}
                    Content: {story['content']}

                    YOUR TASK:
                    Write a complete newsletter article in EXACTLY this structure, with NO labels, headers, or section markers anywhere:

                    [LINE 1] One headline sentence. Bold, declarative, specific. Must include the single most surprising or important fact from the content. No punctuation at the end except a period.

                    [BLANK LINE]

                    [PARAGRAPHS] Write 4 to 5 paragraphs. Each paragraph must:
                    - Open with a strong topic sentence containing a specific fact, number, name, or date
                    - Explain what happened, why it matters, who is affected, and what to watch next
                    - Flow naturally from one to the next like a single coherent story
                    - Never repeat a fact already used in a previous paragraph

                    [BLANK LINE]

                    Fast Facts
                    - [fact 1]
                    - [fact 2]
                    - [fact 3]
                    - [fact 4]
                    - [fact 5]
                    - [fact 6]

                    STRICT RULES:
                    - Use **bold** for every proper noun, number, date, organization, location, and key technical term on first mention
                    - Every single sentence must contain at least one specific fact, name, number, or date from the source — no filler sentences allowed
                    - Fast Facts must each be one concise sentence starting with a bold term
                    - Never write: HEADLINE, BODY, SECTION, SUMMARY, KEY POINTS, PART, [LINE 1], [PARAGRAPHS], or any structural label
                    - No markdown except bold and bullet dashes (-)
                    - Do not invent facts, quotes, statistics, or names not present in the source
                    - Target word count: {target_min} to {target_max} words total
                    - Write in present tense where possible for immediacy
                    - Tone: authoritative but accessible — smart without being academic"""
                    
                    response = client.chat.completions.create(
                        model='qwen/qwen3-32b',
                        messages=[{'role': 'user', 'content': prompt}],
                        max_tokens=1500
                    )

                    # Get raw text from API
                    raw_api_text = response.choices[0].message.content.strip()
                    
                    # Use raw API output directly
                    story['summary'] = raw_api_text

                    request_count += 1
                    print(f"[{request_count}/{len(stories)}] Summarized: {story['title'][:50]}")

                    # ── Throttle: pause every 5 requests ──
                    if request_count % 5 == 0:
                        print("Throttling — waiting 90s to stay under rate limit...")
                        time.sleep(90)
                    else:
                        time.sleep(20)

                    break  # success, exit retry loop

                except Exception as e:
                    error_msg = str(e).lower()
                    if 'rate_limit' in error_msg or '429' in error_msg:
                        wait_time = 30 * (2 ** attempt)
                        print(f"  ⚠ Rate limited on attempt {attempt+1}. Waiting {wait_time}s...")
                        time.sleep(wait_time)
                        continue 
                    
                    print(f"  ✗ Groq error on '{story['title'][:40]}': {e}")
                    story['summary'] = ''
                    break

            if not story.get('summary'):
                story['summary'] = ''

            summarized.append(story)

        print(f"\nDone. Summarized {sum(1 for s in summarized if s['summary'])} / {len(stories)} stories.")
        return summarized


    @task(retries=2, retry_delay=timedelta(minutes=2))
    def save_to_postgres(stories):
        conn = psycopg2.connect(
            host=POSTGRES_HOST,
            database=POSTGRES_DB,
            user=POSTGRES_USER,
            password=POSTGRES_PASSWORD,
            port=POSTGRES_PORT,
        )
        cursor = conn.cursor()
        saved = 0
        skipped = 0

        for story in stories:
            if not story.get('summary'):
                skipped += 1
                continue

            try:
                cursor.execute("""
                    INSERT INTO stories (
                        story_id, title, url, content, summary,
                        cover_image, author, category, source,
                        published_at, fetched_at
                    )
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (story_id) DO UPDATE SET
                        summary    = EXCLUDED.summary,
                        fetched_at = EXCLUDED.fetched_at;
                """, (
                    story['story_id'],    story['title'],
                    story['url'],         story['content'],
                    story['summary'],     story['cover_image'],
                    story['author'],      story['category'],
                    story['source'],      story['published_at'],
                    story['fetched_at'],
                ))
                conn.commit()
                saved += 1
            except Exception as e:
                conn.rollback()
                print(f"  DB error for '{story['title'][:60]}': {e}")

        cursor.close()
        conn.close()
        print(f"\nSaved: {saved} | Skipped (no summary): {skipped}")

    stories    = fetch_from_newsapi()
    summarized = generate_summaries(stories)
    save_to_postgres(summarized)