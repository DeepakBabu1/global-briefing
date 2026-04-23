from fastapi import FastAPI, HTTPException, Depends, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from typing import List, Optional
import psycopg2
from psycopg2.extras import RealDictCursor
import os
import redis
import json
from datetime import datetime, timedelta, timezone
import logging
import bcrypt
import jwt
from passlib.context import CryptContext
import resend
from bs4 import BeautifulSoup
import requests
import openai
from newspaper import Article
# from wordcloud import WordCloud
# import matplotlib.pyplot as plt
import io
import base64

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/postgres")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
JWT_SECRET = os.getenv("JWT_SECRET", "your_jwt_secret_here")
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "re_your_api_key_here")
RESEND_FROM_EMAIL = os.getenv("RESEND_FROM_EMAIL", "noreply@globalbriefing.com")

# Initialize Resend
resend.api_key = RESEND_API_KEY

app = FastAPI(title="The Global Briefing API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security
security = HTTPBearer()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Database connection
def get_db():
    conn = psycopg2.connect(DATABASE_URL)
    try:
        yield conn
    finally:
        conn.close()

# Redis connection
try:
    redis_client = redis.from_url(REDIS_URL)
    redis_client.ping()
    logger.info("Redis connected")
except Exception as e:
    logger.warning(f"Redis not available: {e}. Caching disabled.")
    redis_client = None

# Pydantic models
class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class User(BaseModel):
    id: int
    name: str
    email: str
    status: str

class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    status: str

class PreferenceCreate(BaseModel):
    preferences: List[str]

class Story(BaseModel):
    story_id: str
    title: str
    url: str
    content: str
    summary: Optional[str] = None
    cover_image: Optional[str] = None
    author: Optional[str] = None
    category: Optional[str] = None
    source: Optional[str] = None
    published_at: Optional[datetime] = None

# Helper functions
def verify_password(plain_password, hashed_password):
    try:
        # Truncate plain password to 72 characters max for bcrypt
        if len(plain_password) > 72:
            plain_password = plain_password[:72]
        # Use direct bcrypt verification
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception as e:
        logger.error(f"Password verification error: {e}")
        # Fallback to passlib if bcrypt fails
        try:
            return pwd_context.verify(plain_password, hashed_password)
        except Exception as e2:
            logger.error(f"Fallback password verification error: {e2}")
            return False

def get_password_hash(password):
    try:
        # Truncate password to 72 characters max for bcrypt
        if len(password) > 72:
            password = password[:72]
        # Use a simpler bcrypt configuration
        return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    except Exception as e:
        logger.error(f"Password hashing error: {e}")
        # Fallback to passlib if bcrypt fails
        try:
            return pwd_context.hash(password[:72])
        except Exception as e2:
            logger.error(f"Fallback password hashing error: {e2}")
            raise HTTPException(status_code=500, detail="Password hashing failed")

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(hours=24)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm="HS256")
    return encoded_jwt

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: psycopg2.extensions.connection = Depends(get_db)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=["HS256"])
        user_id: int = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    cursor = db.cursor(cursor_factory=RealDictCursor)
    cursor.execute("SELECT id, name, email, status FROM users WHERE id = %s", (user_id,))
    user = cursor.fetchone()
    cursor.close()
    
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    
    return user

# Authentication endpoints
@app.post("/api/auth/signup", status_code=status.HTTP_201_CREATED)
async def signup(user_data: UserCreate, db: psycopg2.extensions.connection = Depends(get_db)):
    try:
        logger.info(f"Signup attempt for email: {user_data.email}")
        cursor = db.cursor(cursor_factory=RealDictCursor)
        
        # Check if user already exists
        cursor.execute("SELECT id FROM users WHERE email = %s", (user_data.email,))
        if cursor.fetchone():
            cursor.close()
            logger.warning(f"Email already registered: {user_data.email}")
            raise HTTPException(status_code=400, detail="Email already registered")
        
        # Create new user
        logger.info(f"Creating user: {user_data.name}")
        hashed_password = get_password_hash(user_data.password)
        logger.info(f"Password hashed successfully")
        
        cursor.execute(
            "INSERT INTO users (name, email, password_hash, status) VALUES (%s, %s, %s, %s) RETURNING id, name, email, status",
            (user_data.name, user_data.email, hashed_password, "active")
        )
        user = cursor.fetchone()
        db.commit()
        cursor.close()
        
        logger.info(f"User created successfully: {user['id']}")
        
        # Create access token for auto-login
        access_token = create_access_token(data={"sub": str(user["id"])})
        logger.info(f"Auto-login token created for user: {user['id']}")
        
        # Send welcome email using Resend
        try:
            logger.info(f"Sending welcome email to: {user_data.email}")
            params = {
                "from": RESEND_FROM_EMAIL,
                "to": [user_data.email],
                "subject": "Welcome to The Global Briefing",
                "html": f"""
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%); padding: 30px; border-radius: 10px; text-align: center; color: white;">
                        <h1 style="margin: 0; font-size: 28px; font-weight: bold;">Welcome to The Global Briefing</h1>
                        <p style="margin: 20px 0; font-size: 16px;">Hello {user_data.name},</p>
                        <p style="margin: 20px 0; font-size: 16px;">Thank you for joining our elite circle of informed readers. Your daily briefing, perfected.</p>
                        <div style="margin: 30px 0;">
                            <a href="http://localhost:3000/login" style="background: white; color: #6366f1; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Get Started</a>
                        </div>
                    </div>
                    <div style="text-align: center; margin-top: 30px; color: #666; font-size: 12px;">
                        <p>&copy; 2024 The Global Briefing. All rights reserved.</p>
                    </div>
                </div>
                """
            }
            resend.Emails.send(params)
            logger.info(f"Welcome email sent successfully to: {user_data.email}")
        except Exception as email_error:
            logger.error(f"Failed to send welcome email: {email_error}")
            # Don't fail the signup if email fails
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": user["id"],
                "name": user["name"],
                "email": user["email"],
                "status": user["status"]
            }
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Signup error: {e}")
        raise HTTPException(status_code=500, detail=f"Signup failed: {str(e)}")

@app.post("/api/auth/login")
async def login(user_data: UserLogin, db: psycopg2.extensions.connection = Depends(get_db)):
    try:
        logger.info(f"Login attempt for email: {user_data.email}")
        cursor = db.cursor(cursor_factory=RealDictCursor)
        
        # Find user by email
        cursor.execute("SELECT id, name, email, password_hash, status FROM users WHERE email = %s", (user_data.email,))
        user = cursor.fetchone()
        cursor.close()
        
        if not user:
            logger.warning(f"User not found: {user_data.email}")
            raise HTTPException(status_code=401, detail="Invalid email or password")
        
        logger.info(f"User found: {user['id']}, verifying password")
        if not verify_password(user_data.password, user["password_hash"]):
            logger.warning(f"Password verification failed for: {user_data.email}")
            raise HTTPException(status_code=401, detail="Invalid email or password")
        
        logger.info(f"Password verified successfully for: {user_data.email}")
        # Create access token
        access_token = create_access_token(data={"sub": str(user["id"])})
        logger.info(f"Token created for user: {user['id']}")
        
        response = {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": user["id"],
                "name": user["name"],
                "email": user["email"],
                "status": user["status"]
            }
        }
        logger.info(f"Login successful for: {user_data.email}")
        return response
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {e}")
        raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")

@app.get("/api/auth/verify")
async def verify_token(current_user: dict = Depends(get_current_user)):
    return {"user": current_user}

@app.post("/api/preferences")
async def save_preferences(
    preferences: PreferenceCreate,
    current_user: dict = Depends(get_current_user),
    db: psycopg2.extensions.connection = Depends(get_db)
):
    """Save user preferences"""
    try:
        cursor = db.cursor(cursor_factory=RealDictCursor)
        
        # Delete existing preferences for this user
        cursor.execute("DELETE FROM preferences WHERE user_id = %s", (current_user['id'],))
        
        # Insert new preferences
        for category in preferences.preferences:
            cursor.execute(
                "INSERT INTO preferences (user_id, category) VALUES (%s, %s)",
                (current_user['id'], category)
            )
        
        db.commit()
        cursor.close()
        
        return {"message": "Preferences saved successfully"}
    
    except Exception as e:
        logger.error(f"Error saving preferences: {e}")
        raise HTTPException(status_code=500, detail="Failed to save preferences")

@app.get("/api/preferences")
async def get_preferences(current_user: dict = Depends(get_current_user), db: psycopg2.extensions.connection = Depends(get_db)):
    """Get user preferences"""
    try:
        cursor = db.cursor(cursor_factory=RealDictCursor)
        cursor.execute(
            "SELECT category FROM preferences WHERE user_id = %s",
            (current_user['id'],)
        )
        preferences = cursor.fetchall()
        cursor.close()
        
        return preferences
    
    except Exception as e:
        logger.error(f"Error fetching preferences: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch preferences")

class Story(BaseModel):
    story_id: str
    title: str
    url: str
    content: str
    summary: Optional[str] = None
    cover_image: Optional[str] = None
    author: Optional[str] = None
    category: Optional[str] = None
    source: Optional[str] = None
    published_at: Optional[datetime] = None
    fetched_at: Optional[datetime] = None

class TopicInsight(BaseModel):
    category: str
    count: int
    engagement_score: float

@app.get("/")
async def root():
    return {"message": "The Global Briefing API", "version": "1.0.0"}

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now()}

@app.get("/api/stories", response_model=List[Story])
async def get_stories(
    category: Optional[str] = Query(None, description="Filter by category"),
    search: Optional[str] = Query(None, description="Search in title and content"),
    date: Optional[str] = Query(None, description="Filter by date (YYYY-MM-DD)"),
    user_id: Optional[int] = Query(None, description="Filter by user preferences"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: psycopg2.extensions.connection = Depends(get_db)
):
    """Get stories with optional filtering"""
    try:
        # Check cache first
        cache_key = f"stories:{category}:{search}:{date}:{user_id}:{limit}:{offset}"
        if redis_client:
            cached_data = redis_client.get(cache_key)
            if cached_data:
                return json.loads(cached_data)


        cursor = db.cursor(cursor_factory=RealDictCursor)
        
        query = """
            SELECT story_id, title, url, content, summary, cover_image, 
                   author, category, source, published_at, fetched_at
            FROM stories
            WHERE 1=1
        """
        params = []
        
        # Add category filter
        if category and category != "All":
            query += " AND category = %s"
            params.append(category)
        
        # Add search filter
        if search:
            query += " AND title ILIKE %s"
            search_term = f"%{search}%"
            params.extend([search_term])
        
        # Add date filter - use timezone-safe range query
        if date:
            # Parse the date and create start/end of day in UTC
            try:
                # Expected format: YYYY-MM-DD
                year, month, day = map(int, date.split('-'))
                start_utc = datetime(year, month, day, 0, 0, 0, tzinfo=timezone.utc)
                end_utc = datetime(year, month, day, 23, 59, 59, 999999, tzinfo=timezone.utc)
                
                query += " AND published_at >= %s AND published_at <= %s"
                params.extend([start_utc, end_utc])
            except (ValueError, IndexError):
                # If date format is invalid, skip date filtering
                pass
        
        # Add user preferences filter
        if user_id:
            query += """
                AND category IN (
                    SELECT category FROM preferences WHERE user_id = %s
                )
            """
            params.append(user_id)
        
        query += " ORDER BY published_at DESC LIMIT %s OFFSET %s"
        params.extend([limit, offset])
        
        cursor.execute(query, params)
        stories = cursor.fetchall()
        
        # Cache for 5 minutes
        def serialize_story(s):
            d = dict(s)
            for key, value in d.items():
                if hasattr(value, 'isoformat'):
                    d[key] = value.isoformat()
            return d

        if redis_client:
            try:
                redis_client.setex(cache_key, 300, json.dumps([serialize_story(s) for s in stories]))
            except Exception as cache_err:
                logger.warning(f"Cache write failed: {cache_err}")
        
        # Handle malformed stories
        result = []
        for story in stories:
            try:
                result.append(Story(**story))
            except Exception as e:
                logger.warning(f"Skipping malformed story: {e}")
        return result
    except Exception as e:
        logger.error(f"Error fetching stories: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch stories")

@app.get("/api/stories/{story_id}", response_model=Story)
async def get_story(story_id: str, db: psycopg2.extensions.connection = Depends(get_db)):
    """Get a specific story by ID"""
    try:
        cursor = db.cursor(cursor_factory=RealDictCursor)
        cursor.execute(
            """
            SELECT story_id, title, url, content, summary, cover_image, 
                   author, category, source, published_at, fetched_at
            FROM stories WHERE story_id = %s
            """,
            (story_id,)
        )
        story = cursor.fetchone()
        
        if not story:
            raise HTTPException(status_code=404, detail="Story not found")
            
        return Story(**story)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching story {story_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

# Insights endpoints
@app.get("/api/insights/topics")
async def get_topic_insights(current_user: dict = Depends(get_current_user), db: psycopg2.extensions.connection = Depends(get_db)):
    """Get topic heatmap data for current user"""
    try:
        cursor = db.cursor(cursor_factory=RealDictCursor)
        
        # Query to get category views in last 30 days
        cursor.execute("""
            SELECT 
                s.category,
                COUNT(ce.id) as views,
                COUNT(DISTINCT DATE(ce.occurred_at)) as active_days
            FROM click_events ce
            JOIN stories s ON ce.story_id = s.story_id
            WHERE ce.user_id = %s 
            AND ce.occurred_at >= NOW() - INTERVAL '30 days'
            GROUP BY s.category
            ORDER BY views DESC
        """, (current_user['id'],))
        
        results = cursor.fetchall()
        cursor.close()
        
        return [
            TopicInsight(
                category=row['category'],
                count=row['views'],
                engagement_score=row['active_days'] * 1.0 / 30  # Engagement based on active days
            )
            for row in results
        ]
    
    except Exception as e:
        logger.error(f"Error fetching topic insights: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch insights")

@app.get("/api/insights/reading-stats")
async def get_reading_stats(current_user: dict = Depends(get_current_user), db: psycopg2.extensions.connection = Depends(get_db)):
    """Get reading statistics for current user"""
    try:
        cursor = db.cursor(cursor_factory=RealDictCursor)
        
        # Time saved calculation
        cursor.execute("""
            SELECT 
                SUM(LENGTH(s.content) - LENGTH(COALESCE(s.summary, ''))) as total_words_saved,
                COUNT(DISTINCT ce.story_id) as stories_read,
                COUNT(DISTINCT DATE(ce.occurred_at)) as reading_days
            FROM click_events ce
            JOIN stories s ON ce.story_id = s.story_id
            WHERE ce.user_id = %s 
            AND ce.occurred_at >= NOW() - INTERVAL '30 days'
        """, (current_user['id'],))
        
        stats = cursor.fetchone()
        
        # Calculate hours saved (assuming 200 words per minute reading speed)
        words_per_minute = 200
        hours_saved = (stats['total_words_saved'] or 0) / (words_per_minute * 60) if stats['total_words_saved'] else 0
        
        # Daily streak calculation
        cursor.execute("""
            WITH reading_days AS (
                SELECT DISTINCT DATE(occurred_at) as reading_date
                FROM click_events
                WHERE user_id = %s
                AND occurred_at >= NOW() - INTERVAL '30 days'
                ORDER BY reading_date DESC
            ),
            streak_groups AS (
                SELECT 
                    reading_date,
                    reading_date - (ROW_NUMBER() OVER (ORDER BY reading_date) || ' days')::INTERVAL as group_date
                FROM reading_days
            )
            SELECT COUNT(*) as current_streak
            FROM streak_groups
            WHERE group_date = (SELECT group_date FROM streak_groups ORDER BY group_date DESC LIMIT 1)
        """, (current_user['id'],))
        
        streak_result = cursor.fetchone()
        current_streak = streak_result['current_streak'] if streak_result else 0
        
        # Reading pattern analysis
        cursor.execute("""
            SELECT 
                EXTRACT(HOUR FROM occurred_at) as hour_of_day,
                EXTRACT(DOW FROM occurred_at) as day_of_week,
                COUNT(*) as clicks
            FROM click_events
            WHERE user_id = %s 
            AND occurred_at >= NOW() - INTERVAL '30 days'
            GROUP BY hour_of_day, day_of_week
            ORDER BY clicks DESC
            LIMIT 1
        """, (current_user['id'],))
        
        pattern = cursor.fetchone()
        peak_time = int(pattern['hour_of_day']) if pattern else 9  # Default 9 AM
        most_active_day = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][int(pattern['day_of_week'])] if pattern else 'Monday'
        
        # Blindspot alert (least read category)
        cursor.execute("""
            SELECT 
                s.category,
                COUNT(ce.id) as views
            FROM stories s
            LEFT JOIN click_events ce ON s.story_id = ce.story_id AND ce.user_id = %s
            WHERE s.category != 'All'
            GROUP BY s.category
            ORDER BY views ASC
            LIMIT 1
        """, (current_user['id'],))
        
        blindspot = cursor.fetchone()
        
        cursor.close()
        
        return {
            "hours_saved": round(hours_saved, 1),
            "stories_read": stats['stories_read'] or 0,
            "reading_days": stats['reading_days'] or 0,
            "current_streak": current_streak,
            "peak_time": f"{peak_time}:00",
            "most_active_day": most_active_day,
            "blindspot_category": blindspot['category'] if blindspot else None
        }
    
    except Exception as e:
        logger.error(f"Error fetching reading stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch reading stats")

# Library endpoints
@app.get("/api/library/liked")
async def get_liked_stories(current_user: dict = Depends(get_current_user), db: psycopg2.extensions.connection = Depends(get_db)):
    """Get stories liked by current user"""
    try:
        cursor = db.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
            SELECT DISTINCT s.story_id, s.title, s.url, s.content, s.summary, 
                   s.cover_image, s.author, s.category, s.source, s.published_at, s.fetched_at
            FROM stories s
            JOIN click_events ce ON s.story_id = ce.story_id
            WHERE ce.user_id = %s 
            AND ce.event_type = 'like'
            ORDER BY ce.occurred_at DESC
            LIMIT 50
        """, (current_user['id'],))
        
        stories = cursor.fetchall()
        cursor.close()
        
        return [Story(**story) for story in stories]
    
    except Exception as e:
        logger.error(f"Error fetching liked stories: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch liked stories")

@app.get("/api/library/saved")
async def get_saved_stories(current_user: dict = Depends(get_current_user), db: psycopg2.extensions.connection = Depends(get_db)):
    """Get stories saved by current user"""
    try:
        cursor = db.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
            SELECT DISTINCT s.story_id, s.title, s.url, s.content, s.summary, 
                   s.cover_image, s.author, s.category, s.source, s.published_at, s.fetched_at
            FROM stories s
            JOIN click_events ce ON s.story_id = ce.story_id
            WHERE ce.user_id = %s 
            AND ce.event_type = 'save'
            ORDER BY ce.occurred_at DESC
            LIMIT 50
        """, (current_user['id'],))
        
        stories = cursor.fetchall()
        cursor.close()
        
        return [Story(**story) for story in stories]
    
    except Exception as e:
        logger.error(f"Error fetching saved stories: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch saved stories")

@app.post("/api/stories/{story_id}/like")
async def like_story(story_id: str, current_user: dict = Depends(get_current_user), db: psycopg2.extensions.connection = Depends(get_db)):
    """Like or unlike a story"""
    try:
        cursor = db.cursor(cursor_factory=RealDictCursor)
        
        # Check if already liked
        cursor.execute("""
            SELECT id FROM click_events 
            WHERE user_id = %s AND story_id = %s AND event_type = 'like'
        """, (current_user['id'], story_id))
        
        existing = cursor.fetchone()
        
        if existing:
            # Unlike - remove the like
            cursor.execute("""
                DELETE FROM click_events 
                WHERE user_id = %s AND story_id = %s AND event_type = 'like'
            """, (current_user['id'], story_id))
            message = "Story unliked"
        else:
            # Like - add the like
            cursor.execute("""
                INSERT INTO click_events (user_id, story_id, event_type, occurred_at)
                VALUES (%s, %s, 'like', NOW())
            """, (current_user['id'], story_id))
            message = "Story liked"
        
        db.commit()
        cursor.close()
        
        return {"message": message}
    
    except Exception as e:
        logger.error(f"Error liking story: {e}")
        raise HTTPException(status_code=500, detail="Failed to like story")

@app.post("/api/stories/{story_id}/save")
async def save_story(story_id: str, current_user: dict = Depends(get_current_user), db: psycopg2.extensions.connection = Depends(get_db)):
    """Save or unsave a story"""
    try:
        cursor = db.cursor(cursor_factory=RealDictCursor)
        
        # Check if already saved
        cursor.execute("""
            SELECT id FROM click_events 
            WHERE user_id = %s AND story_id = %s AND event_type = 'save'
        """, (current_user['id'], story_id))
        
        existing = cursor.fetchone()
        
        if existing:
            # Unsave - remove the save
            cursor.execute("""
                DELETE FROM click_events 
                WHERE user_id = %s AND story_id = %s AND event_type = 'save'
            """, (current_user['id'], story_id))
            message = "Story unsaved"
        else:
            # Save - add the save
            cursor.execute("""
                INSERT INTO click_events (user_id, story_id, event_type, occurred_at)
                VALUES (%s, %s, 'save', NOW())
            """, (current_user['id'], story_id))
            message = "Story saved"
        
        db.commit()
        cursor.close()
        
        return {"message": message}
    
    except Exception as e:
        logger.error(f"Error saving story: {e}")
        raise HTTPException(status_code=500, detail="Failed to save story")


@app.get("/api/stats/summary")
async def get_stats_summary(db: psycopg2.extensions.connection = Depends(get_db)):
    """Get overall statistics summary"""
    try:
        cursor = db.cursor(cursor_factory=RealDictCursor)
        
        # Get total stories, users, and recent activity
        cursor.execute(
            """
            SELECT 
                (SELECT COUNT(*) FROM stories) as total_stories,
                (SELECT COUNT(*) FROM stories WHERE published_at >= %s) as stories_today,
                (SELECT COUNT(*) FROM stories WHERE published_at >= %s) as stories_this_week,
                (SELECT COUNT(DISTINCT category) FROM stories WHERE category IS NOT NULL) as total_categories
            """,
            (datetime.now().replace(hour=0, minute=0, second=0, microsecond=0),
             datetime.now() - timedelta(days=7))
        )
        
        stats = cursor.fetchone()
        return dict(stats)
        
    except Exception as e:
        logger.error(f"Error fetching stats summary: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/api/clear-cache")
async def clear_cache():
    """Clear Redis cache"""
    try:
        redis_client.flushdb()
        return {"message": "Cache cleared successfully"}
    except Exception as e:
        logger.error(f"Error clearing cache: {e}")
        raise HTTPException(status_code=500, detail="Failed to clear cache")





@app.post("/api/newsletter/send")
async def send_newsletter(current_user: dict = Depends(get_current_user), db: psycopg2.extensions.connection = Depends(get_db)):
    """Send automated newsletter to user based on their preferences"""
    try:
        cursor = db.cursor(cursor_factory=RealDictCursor)
        
        # Get user's preferences
        cursor.execute("""
            SELECT category FROM preferences WHERE user_id = %s
        """, (current_user['id'],))
        preferences = [row['category'] for row in cursor.fetchall()]
        
        if not preferences:
            return {"message": "No preferences found", "status": "error"}
        
        # Implement "One Topic Rule" - select category with highest story count for today
        cursor.execute("""
            SELECT category, COUNT(*) as story_count
            FROM stories 
            WHERE DATE(published_date) = CURRENT_DATE
            AND category = ANY(%s)
            GROUP BY category
            ORDER BY story_count DESC
            LIMIT 1
        """, (preferences,))
        
        trending_result = cursor.fetchone()
        selected_category = trending_result['category'] if trending_result else preferences[0]
        
        # Get top story from selected category
        cursor.execute("""
            SELECT * FROM stories 
            WHERE category = %s 
            AND DATE(published_date) = CURRENT_DATE
            ORDER BY published_date DESC
            LIMIT 1
        """, (selected_category,))
        
        story = cursor.fetchone()
        cursor.close()
        
        if not story:
            return {"message": "No stories found for newsletter", "status": "error"}
        
        # Create professional HTML email template
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>The Global Briefing | {selected_category}</title>
            <style>
                body {{
                    font-family: 'Playfair Display', Georgia, serif;
                    margin: 0;
                    padding: 20px;
                    background-color: #fafbfc;
                    color: #1a202c;
                }}
                .container {{
                    max-width: 600px;
                    margin: 0 auto;
                    background-color: #ffffff;
                    border-radius: 12px;
                    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
                    overflow: hidden;
                }}
                .header {{
                    background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
                    color: #ffffff;
                    padding: 32px;
                    text-align: center;
                }}
                .header h1 {{
                    margin: 0;
                    font-size: 28px;
                    font-weight: 700;
                    letter-spacing: -0.02em;
                }}
                .content {{
                    padding: 32px;
                }}
                .cover-image {{
                    width: 100%;
                    height: 300px;
                    object-fit: cover;
                    border-radius: 8px;
                    margin-bottom: 24px;
                }}
                .story-title {{
                    font-family: 'Playfair Display', Georgia, serif;
                    font-size: 24px;
                    font-weight: 600;
                    color: #1a202c;
                    margin-bottom: 16px;
                    line-height: 1.3;
                }}
                .story-summary {{
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                    font-size: 16px;
                    line-height: 1.6;
                    color: #4b5563;
                    margin-bottom: 32px;
                }}
                .cta-button {{
                    display: inline-block;
                    background: #2563eb;
                    color: #ffffff;
                    padding: 16px 32px;
                    text-decoration: none;
                    border-radius: 8px;
                    font-weight: 600;
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                    transition: all 0.2s ease;
                }}
                .cta-button:hover {{
                    background: #1d4ed8;
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.15);
                }}
                .footer {{
                    text-align: center;
                    padding: 24px;
                    border-top: 1px solid #e5e7eb;
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                    font-size: 14px;
                    color: #6b7280;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>The Global Briefing | {selected_category}</h1>
                </div>
                <div class="content">
                    <img src="{story.get('image_url', '')}" alt="Story cover" class="cover-image">
                    <h2 class="story-title">{story['title']}</h2>
                    <p class="story-summary">{story['summary']}</p>
                    <a href="http://localhost:3000/story/{story['story_id']}" class="cta-button">Read Full Story</a>
                </div>
                <div class="footer">
                    <p>Curated summaries from trusted sources. Designed for readers who want signal, not noise.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        # Send email using Resend
        params = {
            "from": RESEND_FROM_EMAIL,
            "to": [current_user['email']],
            "subject": f"The Global Briefing | {selected_category}",
            "html": html_content,
        }
        
        r = resend.Emails.send(params)
        
        return {
            "message": f"Newsletter sent successfully to {current_user['email']}",
            "status": "success",
            "category": selected_category,
            "story_id": story['story_id']
        }
    
    except Exception as e:
        logger.error(f"Error sending newsletter: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to send newsletter: {str(e)}")

@app.get("/api/newsletter/status")
async def get_newsletter_status(current_user: dict = Depends(get_current_user), db: psycopg2.extensions.connection = Depends(get_db)):
    """Get newsletter sending status for current user"""
    try:
        cursor = db.cursor(cursor_factory=RealDictCursor)
        
        # Get today's newsletter status
        cursor.execute("""
            SELECT * FROM newsletter_logs 
            WHERE user_id = %s AND DATE(sent_at) = CURRENT_DATE
            ORDER BY sent_at DESC
            LIMIT 1
        """, (current_user['id'],))
        
        newsletter_log = cursor.fetchone()
        cursor.close()
        
        if newsletter_log:
            return {
                "status": "sent",
                "category": newsletter_log['category'],
                "story_id": newsletter_log['story_id'],
                "sent_at": newsletter_log['sent_at']
            }
        else:
            return {
                "status": "not_sent",
                "message": "No newsletter sent today"
            }
    
    except Exception as e:
        logger.error(f"Error getting newsletter status: {e}")
        raise HTTPException(status_code=500, detail="Failed to get newsletter status")

@app.on_event("startup")
async def startup_event():
    """Initialize database tables"""
    # Database tables are created by init.sql, so no need to recreate here
    logger.info("Backend startup completed")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
