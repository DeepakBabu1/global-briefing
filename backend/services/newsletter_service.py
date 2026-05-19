import os
import psycopg2
from datetime import datetime, date
from resend import Resend
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Database connection
def get_db_connection():
    return psycopg2.connect(
        host=os.getenv('POSTGRES_HOST', 'postgres'),
        port=os.getenv('POSTGRES_PORT', '5432'),
        database=os.getenv('POSTGRES_DB', 'postgres'),
        user=os.getenv('POSTGRES_USER', 'postgres'),
        password=os.getenv('POSTGRES_PASSWORD', 'postgres')
    )

def send_daily_newsletter():
    """
    Send personalized daily newsletter to all users based on their category preferences
    """
    try:
        # Initialize Resend
        resend.api_key = os.getenv('RESEND_API_KEY')
        
        # Get today's date
        today = date.today().strftime('%Y-%m-%d')
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Get all users
        cursor.execute("SELECT id, email, name FROM users WHERE email IS NOT NULL")
        users = cursor.fetchall()
        
        # Get today's stories
        cursor.execute("""
            SELECT story_id, title, summary, category, url 
            FROM stories 
            WHERE DATE(published_at) = %s
            ORDER BY category, published_at DESC
        """, (today,))
        stories = cursor.fetchall()
        
        if not stories:
            logger.info(f"No stories found for {today}")
            conn.close()
            return {"message": "No stories to send", "sent": 0, "failed": 0}
        
        # Group stories by category
        stories_by_category = {}
        for story in stories:
            category = story[3]
            if category not in stories_by_category:
                stories_by_category[category] = []
            stories_by_category[category].append(story)
        
        success_count = 0
        failed_count = 0
        
        # Send email to each user
        for user in users:
            try:
                # Get user's preferences
                cursor.execute("""
                    SELECT category FROM preferences WHERE user_id = %s
                """, (user[0],))
                user_prefs = [row[0] for row in cursor.fetchall()]
                
                # Filter stories based on preferences
                if user_prefs:
                    filtered_stories = []
                    for pref_category in user_prefs:
                        if pref_category in stories_by_category:
                            # Take top story from each preferred category
                            filtered_stories.extend(stories_by_category[pref_category][:1])
                else:
                    # No preferences - send top 1 story from each category
                    filtered_stories = []
                    for category_stories in stories_by_category.values():
                        filtered_stories.extend(category_stories[:1])
                
                if not filtered_stories:
                    logger.info(f"No relevant stories for user {user[1]}")
                    continue
                
                # Build email HTML
                html_content = build_email_html(user[2], filtered_stories, today)
                
                # Send email
                params = {
                    "from": os.getenv('RESEND_FROM_EMAIL', 'noreply@globalbriefing.com'),
                    "to": [user[1]],
                    "subject": f"The Global Briefing | {today}",
                    "html": html_content,
                }
                
                resend.Emails.send(params)
                success_count += 1
                logger.info(f"Newsletter sent successfully to: {user[1]}")
                
            except Exception as e:
                failed_count += 1
                logger.error(f"Failed to send newsletter to {user[1]}: {str(e)}")
        
        conn.close()
        
        logger.info(f"Newsletter sending completed: {success_count} sent, {failed_count} failed")
        return {
            "message": f"Newsletter sending completed: {success_count} sent, {failed_count} failed",
            "sent": success_count,
            "failed": failed_count
        }
        
    except Exception as e:
        logger.error(f"Error in send_daily_newsletter: {str(e)}")
        return {"error": str(e), "sent": 0, "failed": 0}

def build_email_html(user_name, stories, newsletter_date):
    """
    Build HTML email template for newsletter
    """
    # Extract headline (first line) from summary
    def get_headline(summary):
        if not summary:
            return ""
        lines = summary.split('\n')
        for line in lines:
            if line.strip():
                return line.strip()
        return ""
    
    # Category colors
    category_colors = {
        'Technology': '#2563eb',
        'Business': '#059669', 
        'Sports': '#dc2626',
        'Entertainment': '#7c3aed',
        'Politics': '#ca8a04',
        'Health': '#16a34a',
        'Science': '#0891b2',
        'World News': '#4338ca'
    }
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>The Global Briefing</title>
        <style>
            body {{
                font-family: Georgia, serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
                background-color: #ffffff;
            }}
            .header {{
                text-align: center;
                margin-bottom: 30px;
                border-bottom: 1px solid #e5e5e5;
                padding-bottom: 20px;
            }}
            .logo {{
                font-size: 28px;
                font-weight: 700;
                color: #1a1a1a;
                margin-bottom: 8px;
            }}
            .date {{
                font-size: 14px;
                color: #666;
                font-family: -apple-system, sans-serif;
            }}
            .story-section {{
                margin-bottom: 25px;
                padding: 20px;
                border: 1px solid #f0f0f0;
                border-radius: 8px;
                background-color: #fafafa;
            }}
            .category-badge {{
                display: inline-block;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 11px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 8px;
                font-family: -apple-system, sans-serif;
            }}
            .story-title {{
                font-size: 20px;
                font-weight: 700;
                color: #1a1a1a;
                margin-bottom: 8px;
                line-height: 1.3;
            }}
            .story-headline {{
                font-size: 15px;
                color: #666;
                margin-bottom: 12px;
                line-height: 1.5;
            }}
            .read-button {{
                display: inline-block;
                background-color: #1a1a1a;
                color: #ffffff;
                text-decoration: none;
                padding: 10px 16px;
                border-radius: 6px;
                font-weight: 600;
                font-family: -apple-system, sans-serif;
                font-size: 14px;
            }}
            .read-button:hover {{
                background-color: #333333;
            }}
            .footer {{
                text-align: center;
                margin-top: 40px;
                padding-top: 20px;
                border-top: 1px solid #e5e5e5;
                font-size: 12px;
                color: #888;
                font-family: -apple-system, sans-serif;
            }}
            .footer a {{
                color: #2563eb;
                text-decoration: none;
            }}
            @media (max-width: 600px) {{
                body {{
                    padding: 10px !important;
                }}
                .story-section {{
                    padding: 15px !important;
                }}
            }}
        </style>
    </head>
    <body>
        <div class="header">
            <div class="logo">The Global Briefing</div>
            <div class="date">{newsletter_date}</div>
        </div>
    """
    
    # Add stories
    for story in stories:
        story_id, title, summary, category, url = story
        headline = get_headline(summary)
        category_color = category_colors.get(category, '#666')
        
        html_content += f"""
        <div class="story-section">
            <div class="category-badge" style="background-color: {category_color}; color: white;">
                {category}
            </div>
            <div class="story-title">{title}</div>
            <div class="story-headline">{headline}</div>
            <a href="{url}" class="read-button">Read Full Story →</a>
        </div>
        """
    
    html_content += f"""
        <div class="footer">
            <p>You're receiving this because you subscribed to The Global Briefing.</p>
            <p><a href="#">Unsubscribe</a></p>
        </div>
    </body>
    </html>
    """
    
    return html_content
