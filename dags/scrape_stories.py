from airflow import DAG
from airflow.decorators import task
from datetime import datetime, timedelta
import requests
import time
import os
import re
import hashlib
import psycopg2
from datetime import date

GROQ_API_KEY       = os.getenv('GROQ_API_KEY', '')
NEWSAPI_KEY        = os.getenv('NEWSAPI_KEY','')  # Set in .env — never hardcode
POSTGRES_HOST      = os.getenv('POSTGRES_HOST', 'postgres')
POSTGRES_PORT      = os.getenv('POSTGRES_PORT', '5432')
POSTGRES_DB        = os.getenv('POSTGRES_DB', 'postgres')
POSTGRES_USER      = os.getenv('POSTGRES_USER', 'postgres')
POSTGRES_PASSWORD  = os.getenv('POSTGRES_PASSWORD', '')

# Change this to any date you want. Revert to dynamic when done:
# TARGET_DATE = "{{ ds }}"  (Airflow template for daily runs)
START_DATE = "2026-04-15"
END_DATE = date.today().strftime("%Y-%m-%d")

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
    dagrun_timeout=timedelta(hours=2),
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
                        'from':       START_DATE,
                        'to':         END_DATE,
                        'language':   'en',
                        'sortBy':     'relevancy',
                        'pageSize':   100,        # increased for date range
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


    @task(retries=2, retry_delay=timedelta(minutes=2), 
          execution_timeout=timedelta(hours=2))
    def generate_and_save(stories):
        """Process and save stories in small batches to avoid timeout."""
        from groq import Groq
        import time
        import re

        client = Groq(api_key=GROQ_API_KEY)
        request_count = 0
        saved = 0

        # ── DB connection ──
        conn = psycopg2.connect(
            host=POSTGRES_HOST, database=POSTGRES_DB,
            user=POSTGRES_USER, password=POSTGRES_PASSWORD,
            port=POSTGRES_PORT,
        )
        cursor = conn.cursor()

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

                    FAST FACTS RULES — this is critical:
                    - Each fact must be a SPECIFIC DATA POINT: a number, percentage, price, date, score, ranking, or named statistic directly from the source
                    - BAD example: "Stamford Bridge is home to Chelsea" — this is common knowledge, not a data point
                    - BAD example: "Pep Guardiola is the manager of Manchester City" — everyone knows this
                    - GOOD example: "Manchester City sits 9 points behind Arsenal with 8 games remaining"
                    - GOOD example: "Chelsea's last 4 Premier League games before the FA Cup were all defeats"
                    - GOOD example: "Alatriste's rent rose from $2,200 to $3,750 — a 73% increase over 5 years"
                    - Each fact must contain at least one specific number, date, price, or named statistic
                    - Never state something that is common knowledge or easily guessed
                    - Never repeat a fact already used in the paragraphs above

                    STRICT RULES:
                    - Use **bold** for every proper noun, number, date, organization, location, and key technical term on first mention
                    - Every single sentence must contain at least one specific fact, name, number, or date from the source — no filler sentences allowed
                    - Never write: HEADLINE, BODY, SECTION, SUMMARY, KEY POINTS, PART, [LINE 1], [PARAGRAPHS], or any structural label
                    - No markdown except bold and bullet dashes (-)
                    - Do not invent facts, quotes, statistics, or names not present in the source
                    - Target word count: {target_min} to {target_max} words total
                    - Write in present tense where possible for immediacy
                    - Tone: authoritative but accessible — smart without being academic"""
                    response = client.chat.completions.create(
                        model='llama-3.3-70b-versatile',
                        messages=[{'role': 'user', 'content': prompt}],
                        max_tokens=2000
                    )

                    raw = response.choices[0].message.content.strip()
                    story['summary'] = re.sub(r'<think>.*?</think>', '', raw, flags=re.DOTALL).strip()

                    request_count += 1
                    print(f"[{request_count}/{len(stories)}] Summarized: {story['title'][:50]}")

                    # ── Save immediately after each summary ──
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
                            story['story_id'], story['title'], story['url'],
                            story['content'], story['summary'], story['cover_image'],
                            story['author'], story['category'], story['source'],
                            story['published_at'], story['fetched_at'],
                        ))
                        conn.commit()
                        saved += 1
                        print(f"  ✓ Saved: {story['title'][:50]}")
                    except Exception as db_err:
                        conn.rollback()
                        print(f"  DB error: {db_err}")

                    # ── Throttle ──
                    if request_count % 5 == 0:
                        print("Throttling — waiting 90s...")
                        time.sleep(90)
                    else:
                        time.sleep(20)

                    break  # success

                except Exception as e:
                    error_msg = str(e).lower()
                    if 'rate_limit' in error_msg or '429' in error_msg:
                        wait_time = 30 * (2 ** attempt)
                        print(f"  ⚠ Rate limited. Waiting {wait_time}s...")
                        time.sleep(wait_time)
                        continue
                    print(f"  ✗ Error: {e}")
                    break

        cursor.close()
        conn.close()
        print(f"\nDone. Saved {saved} / {len(stories)} stories.")
    stories = fetch_from_newsapi()
    generate_and_save(stories)