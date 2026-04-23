-- The Global Briefing Newsletter Database Schema
-- Port 5433 for external access, Port 5432 for internal Docker networking

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Preferences table
CREATE TABLE IF NOT EXISTS preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Stories table - CRITICAL: story_id must be VARCHAR(100) as Primary Key
CREATE TABLE IF NOT EXISTS stories (
    story_id VARCHAR(100) PRIMARY KEY,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    content TEXT NOT NULL,
    summary TEXT, -- AI-generated summary with markdown **bolding**
    cover_image TEXT,
    author TEXT,
    category VARCHAR(100),
    source VARCHAR(255),
    published_at TIMESTAMP,
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Newsletter table
CREATE TABLE IF NOT EXISTS newsletter (
    id SERIAL PRIMARY KEY,
    edition VARCHAR(100) NOT NULL,
    sent_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    total_stories INTEGER DEFAULT 0
);

-- Sent_Emails table
CREATE TABLE IF NOT EXISTS sent_emails (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    newsletter_id INTEGER REFERENCES newsletter(id) ON DELETE CASCADE,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    email_status VARCHAR(50) DEFAULT 'sent'
);

-- Click_Events table
CREATE TABLE IF NOT EXISTS click_events (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    story_id VARCHAR(100) REFERENCES stories(story_id) ON DELETE CASCADE,
    occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    event_type VARCHAR(50) DEFAULT 'view'
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_stories_category ON stories(category);
CREATE INDEX IF NOT EXISTS idx_stories_published_at ON stories(published_at);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_preferences_user_id ON preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_click_events_user_id ON click_events(user_id);
CREATE INDEX IF NOT EXISTS idx_click_events_story_id ON click_events(story_id);

-- Insert sample categories for preferences
INSERT INTO preferences (user_id, category) 
SELECT 1, unnest(ARRAY['Technology', 'Politics', 'Business', 'Sports', 'Health', 'Science', 'World News'])
WHERE EXISTS (SELECT 1 FROM users WHERE id = 1)
ON CONFLICT DO NOTHING;
