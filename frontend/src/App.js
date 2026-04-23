import React, { useState, useEffect, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useNavigate, useParams } from 'react-router-dom';
import { Search, Calendar, TrendingUp, Library, LogOut, Mail, Lock, User, Heart, Bookmark, ArrowUpRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import validator from 'validator';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import './App.css';

const CATEGORIES = ["All", "Technology", "Politics", "Business", "Sports", "Health", "Science", "World News", "Entertainment"];

// Fix UTF-8 encoding issues with octal sequences
const fixEncoding = (text) => {
  if (!text) return '';
  return text
    // Fix octal UTF-8 escape sequences
    .replace(/\\342\\200\\231/g, '\u2019')  // right apostrophe
    .replace(/\\342\\200\\234/g, '\u201c')  // left double quote
    .replace(/\\342\\200\\235/g, '\u201d')  // right double quote
    .replace(/\\342\\200\\224/g, '\u2014')  // em dash
    .replace(/\\342\\200\\223/g, '\u2013')  // en dash
    .replace(/\\342\\200\\230/g, '\u2018')  // left apostrophe
    // Fix Latin-1 mis-decoded equivalents
    .replace(/\u00E2\u0080\u0099/g, '\u2019')  // right apostrophe
    .replace(/\u00E2\u0080\u009C/g, '\u201c')  // left double quote
    .replace(/\u00E2\u0080\u009D/g, '\u201d')  // right double quote
    .replace(/\u00E2\u0080\u0094/g, '\u2014')  // em dash
    .replace(/\u00E2\u0080\u0093/g, '\u2013')  // en dash
    .replace(/\u00E2\u0080\u0098/g, '\u2018'); // left apostrophe
};

// Authentication Context
const AuthContext = React.createContext();

export { AuthContext };

// API base URL - Direct Call Policy using hardcoded value
const API_BASE_URL = 'http://127.0.0.1:5000';

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const initializeAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          // Verify token and get user info
          const response = await fetch(`${API_BASE_URL}/api/auth/verify`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          
          if (response.ok) {
            const data = await response.json();
            setUser(data.user);
            console.log('User authenticated:', data.user);
          } else {
            // Token is invalid, remove it
            localStorage.removeItem('token');
            setUser(null);
            console.log('Token invalid, removed from storage');
          }
        } catch (error) {
          console.error('Token verification error:', error);
          localStorage.removeItem('token');
          setUser(null);
        }
      } else {
        console.log('No token found in storage');
        setUser(null);
      }
      setLoading(false);
    };

    initializeAuth();
  }, []);

  const login = async (email, password, { redirect = true } = {}) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        localStorage.setItem('token', data.access_token);
        setUser(data.user);
        console.log('Login successful:', data.user);
        if (redirect) {
          navigate('/');
        }
        return true;
      } else {
        throw new Error(data.detail || 'Login failed');
      }
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const signup = async (name, email, password) => {
    try {
      // Validate email format
      if (!validator.isEmail(email)) {
        throw new Error('Please enter a valid email address');
      }
      
      const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });
      const data = await response.json();
      if (response.ok) {
        // Auto-login after successful signup - call login function internally without redirect
        await login(email, password, { redirect: false });
        // Navigate to onboarding for new users
        navigate('/onboarding');
        return true;
      } else {
        throw new Error(data.detail || 'Signup failed');
      }
    } catch (error) {
      console.error('Signup error:', error);
      throw error;
    }
  };

  const logout = () => {
    console.log('Logging out user');
    localStorage.removeItem('token');
    setUser(null);
    navigate('/login');
  };

  const value = {
    user,
    login,
    signup,
    logout,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
// Preferences Modal Component
function PreferencesModal({ isOpen, onClose, onSave, preferences }) {
  const [selectedCategories, setSelectedCategories] = useState(preferences || []);
  const [isSaving, setIsSaving] = useState(false);

  const handleCategoryToggle = (category) => {
    if (selectedCategories.includes(category)) {
      setSelectedCategories(selectedCategories.filter(cat => cat !== category));
    } else {
      setSelectedCategories([...selectedCategories, category]);
    }
  };

  const handleSave = async () => {
    if (selectedCategories.length < 3) {
      alert('Please select at least 3 categories');
      return;
    }

    setIsSaving(true);
    try {
      await onSave(selectedCategories);
      onClose();
    } catch (error) {
      console.error('Error saving preferences:', error);
      alert('Failed to save preferences');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="preferences-modal-overlay">
      <div className="preferences-modal">
        <div className="preferences-header">
          <h2>Personalize Your News Feed</h2>
          <p>Select the topics that interest you most. We'll use these to curate your daily briefing.</p>
        </div>
        
        <div className="preferences-grid">
          {CATEGORIES.filter(cat => cat !== 'All').map(category => (
            <div
              key={category}
              className={`preference-card ${selectedCategories.includes(category) ? 'selected' : ''}`}
              onClick={() => handleCategoryToggle(category)}
            >
              <h3>{category}</h3>
              <p>Get the latest {category.toLowerCase()} news and insights tailored to your interests</p>
            </div>
          ))}
        </div>
        
        <div className="preferences-footer">
          <div className="preferences-counter">
            {selectedCategories.length} of {CATEGORIES.length - 1} selected
          </div>
          <div className="preferences-actions">
            <button className="preferences-skip" onClick={onClose}>
              Skip for now
            </button>
            <button 
              className={`preferences-save ${selectedCategories.length >= 3 ? 'active' : ''}`}
              onClick={handleSave}
              disabled={isSaving || selectedCategories.length < 3}
            >
              {isSaving ? 'Saving...' : `Continue (${selectedCategories.length}/3)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper function to get category icons
function getCategoryIcon(category) {
  const icons = {
    'Technology': '💻',
    'Politics': '🏛️',
    'Business': '💼',
    'Sports': '⚽',
    'Health': '🏥',
    'Science': '🔬',
    'World News': '🌍'
  };
  return icons[category] || '📰';
}


// Preferences Manager Modal Component
function PreferencesManagerModal({ isOpen, onClose }) {
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const { user } = useAuth();

  // Professional category descriptions
  const categoryDescriptions = {
    'Technology': 'The pulse of innovation, from Silicon Valley to the future of AI.',
    'Politics': 'Unbiased coverage of the shifts and power plays shaping our world.',
    'Business': 'Market moves and economic insights to keep you ahead of the curve.',
    'Sports': 'Beyond the scoreboard: the stories and strategy behind the game.',
    'Health': 'Cutting-edge wellness and medical breakthroughs for a longer life.',
    'Science': 'Exploring the frontiers of the known universe and human discovery.',
    'World News': 'A global lens on the events that connect us across borders.'
  };

  useEffect(() => {
    if (isOpen && user) {
      fetchCurrentPreferences();
    }
  }, [isOpen, user]);

  const fetchCurrentPreferences = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/preferences`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const preferences = await response.json();
        setSelectedCategories(preferences.map(p => p.category));
      }
    } catch (error) {
      console.error('Error fetching preferences:', error);
    }
  };

  const handleCategoryToggle = (category) => {
    if (selectedCategories.includes(category)) {
      setSelectedCategories(selectedCategories.filter(cat => cat !== category));
    } else {
      setSelectedCategories([...selectedCategories, category]);
    }
  };

  const handleSave = async () => {
    if (selectedCategories.length < 2) {
      alert('Please select at least 2 categories');
      return;
    }

    setIsSaving(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/preferences`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ preferences: selectedCategories })
      });

      if (response.ok) {
        // Close modal and refresh page to show updated news feed
        onClose();
        window.location.reload(); // Full refresh to ensure global state update
      }
    } catch (error) {
      console.error('Error saving preferences:', error);
      alert('Failed to save preferences');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="preferences-modal-overlay">
      <div className="preferences-modal">
        <div className="preferences-header">
          <h2>Manage My Interests</h2>
          <p>Update your preferences to personalize your daily briefing</p>
        </div>
        
        <div className="preferences-grid">
          {CATEGORIES.filter(cat => cat !== 'All').map(category => (
            <div
              key={category}
              className={`preference-card ${selectedCategories.includes(category) ? 'selected' : ''}`}
              onClick={() => handleCategoryToggle(category)}
            >
              <h3 className="category-name">{category}</h3>
              <p className="category-description">{categoryDescriptions[category]}</p>
            </div>
          ))}
        </div>
        
        <div className="preferences-footer">
          <div className="preferences-counter">
            {selectedCategories.length} of {CATEGORIES.length - 1} selected
          </div>
          <div className="preferences-actions">
            <button className="preferences-skip" onClick={onClose}>
              Cancel
            </button>
            <button 
              className={`preferences-save ${selectedCategories.length >= 2 ? 'active' : ''}`}
              onClick={handleSave}
              disabled={isSaving || selectedCategories.length < 2}
            >
              {isSaving ? 'Saving...' : `Update (${selectedCategories.length}/2)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// DatePicker Component
function DatePicker({ selectedDate, onDateSelect, onClose }) {
  const [currentMonth, setCurrentMonth] = useState(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  const [hoveredDate, setHoveredDate] = useState(null);

  const getDaysInMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const handlePreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const handleDateClick = (day) => {
    const newDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    onDateSelect(newDate);
  };

  const renderCalendarDays = () => {
    const daysInMonth = getDaysInMonth(currentMonth);
    const firstDay = getFirstDayOfMonth(currentMonth);
    const days = [];

    // Add empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="calendar-day empty"></div>);
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const isToday = day === selectedDate.getDate() && 
                     currentMonth.getMonth() === selectedDate.getMonth() && 
                     currentMonth.getFullYear() === selectedDate.getFullYear();
      const isHovered = day === hoveredDate;
      
      days.push(
        <div
          key={day}
          className={`calendar-day ${isToday ? 'selected' : ''} ${isHovered ? 'hovered' : ''}`}
          onClick={() => handleDateClick(day)}
          onMouseEnter={() => setHoveredDate(day)}
          onMouseLeave={() => setHoveredDate(null)}
        >
          {day}
        </div>
      );
    }

    return days;
  };

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  return (
    <div className="date-picker-dropdown">
      <div className="date-picker-header">
        <button onClick={handlePreviousMonth} className="date-picker-nav">
          ‹
        </button>
        <div className="date-picker-month">
          {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
        </div>
        <button onClick={handleNextMonth} className="date-picker-nav">
          ›
        </button>
      </div>
      <div className="date-picker-weekdays">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
          <div key={day} className="calendar-weekday">{day}</div>
        ))}
      </div>
      <div className="calendar-days">
        {renderCalendarDays()}
      </div>
    </div>
  );
}

function Navigation({ currentPage, onCategoryChange, selectedCategory, onSearchChange, onDateChange, selectedDate, userPreferences, onSearchTrigger }) {
  const { user, logout } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchTimeout, setSearchTimeout] = useState(null);
  const [showPreferencesModal, setShowPreferencesModal] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());

  const handleLogout = () => {
    logout();
  };

  const handleSearchChange = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    const newTimeout = setTimeout(() => {
      onSearchChange(query);
    }, 300);
    
    setSearchTimeout(newTimeout);
  };

  const handleDailyDropClick = () => {
    setShowPreferencesModal(true);
  };

  const handleDateClick = () => {
    setShowDatePicker(!showDatePicker);
  };

  const handleDateSelect = (date) => {
    setCurrentDate(date);
    setShowDatePicker(false);
    if (onDateChange) {
      // Extract date in local timezone without UTC conversion
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`; // "YYYY-MM-DD"
      console.log('DEBUG: Selected date (local):', dateStr);
      onDateChange(dateStr);
    }
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-GB', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric' 
    });
  };

  return (
    <>
      <header className="header">
        <div className="header-left">
          <Link to="/" className="logo-link">
            <h1 className="logo">The Global Briefing</h1>
          </Link>
        </div>
        
        <div className="header-center">
          <div className="search-bar-container">
            <svg 
              className="search-icon clickable" 
              xmlns="http://www.w3.org/2000/svg" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor" 
              strokeWidth="2"
              onClick={() => onSearchTrigger && onSearchTrigger()}
              style={{ cursor: 'pointer' }}
            >
              <circle cx="11" cy="11" r="8"/>
              <path strokeLinecap="round" d="M21 21l-4.35-4.35"/>
            </svg>
            <input 
              className="search-bar-input"
              type="text"
              placeholder="Search the briefing..."
              autoComplete="off"
              spellCheck="false"
              value={searchQuery}
              onChange={handleSearchChange}
              onKeyDown={(e) => { if (e.key === 'Enter') onSearchTrigger && onSearchTrigger(); }}
            />
          </div>
        </div>
        
        <div className="header-right">
          {user ? (
            <>
              <div className="date-picker-container">
                <Calendar className="date-picker-icon" />
                <button 
                  className="date-picker-input"
                  onClick={handleDateClick}
                >
                  {formatDate(currentDate)}
                </button>
                {showDatePicker && (
                  <DatePicker
                    selectedDate={currentDate}
                    onDateSelect={handleDateSelect}
                    onClose={() => setShowDatePicker(false)}
                  />
                )}
              </div>
              {user && userPreferences && userPreferences.length > 0 && (
                <button className="daily-drop-link" onClick={handleDailyDropClick}>
                  <span className="status-dot"></span>
                  Daily Drop Active
                </button>
              )}
              <Link to="/insights" className={`nav-link ${currentPage === 'insights' ? 'active' : ''}`}>
                Insights
              </Link>
              <Link to="/library" className={`nav-link ${currentPage === 'library' ? 'active' : ''}`}>
                Library
              </Link>
              <button onClick={handleLogout} className="logout-btn">
                <LogOut size={20} />
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="nav-link">Sign In</Link>
              <Link to="/signup" className="signup-btn">Sign Up</Link>
            </>
          )}
        </div>
      </header>

      <PreferencesManagerModal 
        isOpen={showPreferencesModal}
        onClose={() => setShowPreferencesModal(false)}
      />
    </>
  );
}

function HomePage() {
  const { user, loading } = useAuth();
  const [stories, setStories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [storiesLoading, setStoriesLoading] = useState(true);
  const [userPreferences, setUserPreferences] = useState([]);

  console.log('HomePage - User state:', user);

  useEffect(() => {
    if (user) {
      fetchUserPreferences();
    }
  }, [user]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchStories();
    }, 300);

    return () => clearTimeout(timer);
  }, [selectedCategory, searchQuery, selectedDate, user]);

  const fetchUserPreferences = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/preferences`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const preferences = await response.json();
        setUserPreferences(preferences.map(p => p.category));
      }
    } catch (error) {
      console.error('Error fetching preferences:', error);
    }
  };

  const fetchStories = async () => {
    try {
      setStoriesLoading(true);
      const token = localStorage.getItem('token');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      
      // Build query parameters
      const params = new URLSearchParams();
      
      // When search is active, ignore category and date filters
      if (!searchQuery.trim()) {
        if (selectedCategory !== 'All') {
          params.append('category', selectedCategory);
        }
        
        if (selectedDate) {
          params.append('date', selectedDate);
          console.log('DEBUG: Selected date for filtering:', selectedDate);
        }
      }
      
      if (searchQuery.trim()) {
        params.append('search', searchQuery.trim());
        console.log('DEBUG: Searching for:', searchQuery.trim());
      }
      
      // Remove aggressive filtering for 'All' category - fetch all stories
      // Only add user_id filter if user has preferences and explicitly wants personalized content
      // if (user && userPreferences.length > 0 && selectedCategory === 'All' && !searchQuery && !selectedDate) {
      //   params.append('user_id', user.id);
      // }
      
      const url = `${API_BASE_URL}/api/stories${params.toString() ? '?' + params.toString() : ''}`;
      
      console.log('DEBUG: API URL:', url);
      const response = await fetch(url, { headers });
      console.log('DEBUG: Response status:', response.status);
      const data = await response.json();
      console.log('DEBUG: Stories received:', data);
      
      // Log article date fields for debugging
      if (Array.isArray(data) && data.length > 0) {
        console.log('DEBUG: Sample article date fields:');
        data.slice(0, 3).forEach((article, index) => {
          console.log(`Article ${index + 1}:`, {
            id: article.story_id,
            title: article.title?.substring(0, 50) + '...',
            published_at: article.published_at,
            published_date: article.published_date,
            date: article.date,
            createdAt: article.createdAt,
            fetched_at: article.fetched_at
          });
        });
      }
      
      // Ensure stories is always an array
      setStories(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching stories:', error);
    } finally {
      setStoriesLoading(false);
    }
  };

  const handleCategoryChange = (category) => {
    setSelectedCategory(category);
  };

  const handleSearchChange = (query) => {
    setSearchQuery(query);
  };

  const handleDateChange = (date) => {
    setSelectedDate(date);
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (!user) return <Navigate to="/login" />;

  console.log('HomePage - User authenticated, rendering home page');

  return (
    <div className="home-page">
      <Navigation 
        currentPage="home" 
        onCategoryChange={handleCategoryChange} 
        selectedCategory={selectedCategory}
        onSearchChange={handleSearchChange}
        onDateChange={handleDateChange}
        selectedDate={selectedDate}
        userPreferences={userPreferences}
        onSearchTrigger={fetchStories}
      />
      <CategoryBar selectedCategory={selectedCategory} onCategoryChange={handleCategoryChange} />
      
      <div className="content-area">
        {!storiesLoading && Array.isArray(stories) && stories.length > 0 && (
          <h2 className="section-heading">
            {searchQuery.trim() ? 'SEARCH RESULTS' : (selectedCategory === 'All' ? 'ALL STORIES' : selectedCategory.toUpperCase())}
          </h2>
        )}
        <div className="stories-grid">
          {storiesLoading ? (
            <div className="loading-placeholder"><p>Loading stories...</p></div>
          ) : !Array.isArray(stories) || stories.length === 0 ? (
            <div className="no-stories-placeholder">
              <p>{searchQuery.trim() ? 'No results found' : 'No stories in this category yet.'}</p>
              {searchQuery.trim() && <p>Try searching for a different topic or keyword.</p>}
            </div>
          ) : (
            stories.map(story => <StoryCard key={story.story_id} story={story} />)
          )}
        </div>
      </div>
      
      <footer className="footer">
        <h3>The Global Briefing</h3>
        <p>Curated summaries from trusted sources. Designed for readers who want signal, not noise.</p>
        <div className="footer-links">
          <a href="#" className="footer-link">Home</a>
          <span className="footer-separator">•</span>
          <span className="footer-text">Sources vary by category</span>
        </div>
      </footer>
    </div>
  );
}

function CategoryBar({ selectedCategory, onCategoryChange }) {
  return (
    <div className="category-bar">
      {CATEGORIES.map(category => (
        <button
          key={category}
          className={`category-pill ${selectedCategory === category ? 'active' : ''}`}
          onClick={() => onCategoryChange(category)}
        >
          {category}
        </button>
      ))}
    </div>
  );
}

function StoryCard({ story }) {
    const [isLiked, setIsLiked] = useState(false);
    const [isSaved, setIsSaved] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const { user } = useAuth();
    const navigate = useNavigate();

    // Check localStorage on mount
    useEffect(() => {
      const likedArticles = JSON.parse(localStorage.getItem('likedArticles') || '[]');
      const savedArticles = JSON.parse(localStorage.getItem('savedArticles') || '[]');
      setIsLiked(likedArticles.some(article => article.story_id === story.story_id));
      setIsSaved(savedArticles.some(article => article.story_id === story.story_id));
    }, [story.story_id]);

    const handleLike = async (e) => {
      e.stopPropagation();
      if (isProcessing) return;
      setIsProcessing(true);
      
      try {
        const likedArticles = JSON.parse(localStorage.getItem('likedArticles') || '[]');
        const newLikedArticles = isLiked 
          ? likedArticles.filter(article => article.story_id !== story.story_id)
          : [...likedArticles, story];
        
        localStorage.setItem('likedArticles', JSON.stringify(newLikedArticles));
        setIsLiked(!isLiked);
      } catch (error) {
        console.error('Error liking story:', error);
      } finally {
        setIsProcessing(false);
      }
    };

    const handleSave = async (e) => {
      e.stopPropagation();
      if (isProcessing) return;
      setIsProcessing(true);
      
      try {
        const savedArticles = JSON.parse(localStorage.getItem('savedArticles') || '[]');
        const newSavedArticles = isSaved 
          ? savedArticles.filter(article => article.story_id !== story.story_id)
          : [...savedArticles, story];
        
        localStorage.setItem('savedArticles', JSON.stringify(newSavedArticles));
        setIsSaved(!isSaved);
      } catch (error) {
        console.error('Error saving story:', error);
      } finally {
        setIsProcessing(false);
      }
    };

    const handleCardClick = () => {
      // Track article read for Insights page
      try {
        const readArticles = JSON.parse(localStorage.getItem('readArticles') || '[]');
        const existingReadArticle = readArticles.find(article => article.id === story.story_id);
        
        if (!existingReadArticle) {
          const newReadArticle = {
            id: story.story_id,
            title: story.title,
            category: story.category,
            readAt: new Date().toISOString()
          };
          readArticles.push(newReadArticle);
          localStorage.setItem('readArticles', JSON.stringify(readArticles));
        }
      } catch (error) {
        console.error('Error tracking read article:', error);
      }
      
      navigate(`/story/${story.story_id}`);
    };

    const formatDate = (dateStr, fallback) => {
    const d = dateStr || fallback;
    if (!d) return 'Recent';
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

    // Strip markdown bold markers for the card preview
    const stripMarkdown = (text) => {
      if (!text) return '';
      
      // Fix encoding first
      const fixedText = fixEncoding(text);
      
      // Split on newlines FIRST to preserve paragraph structure
      const rawLines = fixedText.split('\n');
      
      // Clean each line individually with the specified steps
      const cleanLine = (line) => {
        return line
          // a) Replace \*{4} (four asterisks) with space
          .replace(/\*{4}/g, ' ')
          // b) Replace /([^\s*])\*\*/g with '$1 '  (space before closing **)
          .replace(/([^\s*])\*\*/g, '$1 ')
          // c) Replace /\*\*([^\s*])/g with ' $1'  (space after opening **)
          .replace(/\*\*([^\s*])/g, ' $1')
          // d) Replace /\*/g with ''               (remove remaining asterisks)
          .replace(/\*/g, '')
          // e) Replace / {2,}/g with ' '           (collapse spaces)
          .replace(/ {2,}/g, ' ')
          // f) Replace / ('s|'s)/g with "'s"       (fix "Trump 's" -> "Trump's")
          .replace(/ ('s|'s)/g, "'s")
          // g) Replace / ([,\.;:!?])/g with '$1'   (fix "Monday ," -> "Monday,")
          .replace(/ ([,\.;:!?])/g, '$1')
          .trim();
      };

      // Clean all lines and join with spaces for card preview
      const cleanedLines = rawLines.map(line => cleanLine(line)).filter(Boolean);
      const cleanedText = cleanedLines.join(' ');
      
      return cleanedText.slice(0, 160) + '...';
    };

    return (
      <div className="story-card" onClick={handleCardClick} style={{ cursor: 'pointer' }}>
        {(story.cover_image || story.image_url) && (
          <div className="story-image-wrapper">
            <img
              src={story.cover_image || story.image_url}
              alt={story.title}
              className="story-image-img"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          </div>
        )}
        <div className="story-card-body">
          <h3 className="story-card-title">{story.title}</h3>
          <span className="story-card-date">{formatDate(story.published_at, story.fetched_at)}</span>
          <p className="story-card-excerpt">{story.summary ? stripMarkdown(story.summary) : ''}</p>
          <div className="story-card-footer">
            <a
              href={story.url}
              target="_blank"
              rel="noopener noreferrer"
              className="story-source-link"
              onClick={(e) => e.stopPropagation()}
            >
              View Original Source
              <ArrowUpRight size={14} style={{ marginLeft: '4px' }} />
            </a>
            {user && (
              <div className="story-card-actions">
                <button
                  className={`action-btn ${isLiked ? 'active' : ''}`}
                  onClick={handleLike}
                  disabled={isProcessing}
                  title="Like"
                >
                  <Heart size={15} fill={isLiked ? 'currentColor' : 'none'} />
                </button>
                <button
                  className={`action-btn ${isSaved ? 'active' : ''}`}
                  onClick={handleSave}
                  disabled={isProcessing}
                  title="Save"
                >
                  <Bookmark size={15} fill={isSaved ? 'currentColor' : 'none'} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

// Insights Page Component
function InsightsPage() {
  const [insights, setInsights] = useState(null);
  const { user } = useAuth();

  useEffect(() => {
    calculateInsights();
  }, []);

  const calculateInsights = () => {
    try {
      const readArticles = JSON.parse(localStorage.getItem('readArticles') || '[]');
      const likedArticles = JSON.parse(localStorage.getItem('likedArticles') || '[]');
      const savedArticles = JSON.parse(localStorage.getItem('savedArticles') || '[]');
      
      // Get all categories from full article feed (for blindspot detection)
      const allCategories = ['Technology', 'Business', 'Science', 'Health', 'Politics', 'World', 'Sports', 'Entertainment'];
      
      // Topic Heatmap: Count articles per category from last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const recentReadArticles = readArticles.filter(article => 
        new Date(article.readAt) >= thirtyDaysAgo
      );
      
      const topicCounts = {};
      recentReadArticles.forEach(article => {
        const category = article.category || 'Other';
        topicCounts[category] = (topicCounts[category] || 0) + 1;
      });
      
      const maxCount = Math.max(...Object.values(topicCounts), 1);
      const topicHeatmap = Object.entries(topicCounts)
        .map(([topic, count]) => ({ topic, count, percentage: (count / maxCount) * 100 }))
        .sort((a, b) => b.count - a.count);

      // Blindspot Alert: Find categories with zero or very low read counts
      const categoryReadCounts = {};
      readArticles.forEach(article => {
        const category = article.category || 'Other';
        categoryReadCounts[category] = (categoryReadCounts[category] || 0) + 1;
      });
      
      // Count reads per category in last 30 days (case-insensitive)
      const recentCategoryCounts = {};
      recentReadArticles.forEach(article => {
        const category = article.category || 'Other';
        const normalizedCategory = category.toLowerCase();
        recentCategoryCounts[normalizedCategory] = (recentCategoryCounts[normalizedCategory] || 0) + 1;
      });
      
      // Find blindspot category
      const allCategoriesNormalized = ['technology', 'politics', 'business', 'sports', 'health', 'science', 'world news', 'entertainment'];
      const categoryCounts = {};
      
      allCategoriesNormalized.forEach(normalizedCat => {
        categoryCounts[normalizedCat] = recentCategoryCounts[normalizedCat] || 0;
      });
      
      const counts = Object.values(categoryCounts);
      const maxReadCount = Math.max(...counts);
      const minCount = Math.min(...counts);
      
      let blindspotAlert;
      let blindspotCategory = null;
      
      if (maxReadCount - minCount <= 1) {
        // All categories read equally (difference of 1 or less)
        blindspotAlert = "Great job! You're reading a diverse range of topics.";
      } else {
        // Find category with lowest count
        const lowestCount = Math.min(...Object.values(categoryCounts));
        const lowestCategories = allCategoriesNormalized.filter(cat => categoryCounts[cat] === lowestCount);
        
        // If tie, pick the one that appears least recently in history
        if (lowestCategories.length > 1) {
          const categoryLastRead = {};
          readArticles.forEach(article => {
            const normalizedCat = (article.category || 'Other').toLowerCase();
            if (!categoryLastRead[normalizedCat] || new Date(article.readAt) > new Date(categoryLastRead[normalizedCat])) {
              categoryLastRead[normalizedCat] = article.readAt;
            }
          });
          
          blindspotCategory = lowestCategories
            .filter(cat => categoryLastRead[cat])
            .sort((a, b) => new Date(categoryLastRead[a]) - new Date(categoryLastRead[b]))[0] || lowestCategories[0];
        } else {
          blindspotCategory = lowestCategories[0];
        }
        
        // Format category name for display (title case)
        const displayCategory = blindspotCategory.split(' ').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
        
        const readCount = categoryCounts[blindspotCategory];
        
        if (readCount === 0) {
          blindspotAlert = `You haven't read any ${displayCategory} stories yet. Try exploring it!`;
        } else {
          blindspotAlert = `You haven't explored ${displayCategory} much lately. Try reading more ${displayCategory} stories.`;
        }
      }

      // Time Saved: 4 minutes saved per article = 0.067 hours
      const timeSaved = (readArticles.length * 0.067).toFixed(1);

      // Daily Streak: Calculate consecutive days with at least one article read
      const streak = calculateDailyStreak(readArticles);

      // Reading Pattern
      const readingPattern = calculateReadingPattern(readArticles);

      setInsights({
        topicHeatmap,
        blindspotAlert,
        timeSaved,
        streak,
        totalArticles: readArticles.length,
        ...readingPattern
      });
    } catch (error) {
      console.error('Error calculating insights:', error);
    }
  };

  const calculateDailyStreak = (readArticles) => {
    if (readArticles.length === 0) return 0;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const readDates = readArticles.map(article => {
      const date = new Date(article.readAt);
      date.setHours(0, 0, 0, 0);
      return date.getTime();
    });
    
    const uniqueDates = [...new Set(readDates)].sort((a, b) => b - a);
    
    let currentStreak = 0;
    let currentDate = today.getTime();
    
    for (const date of uniqueDates) {
      if (date === currentDate) {
        currentStreak++;
        currentDate -= 24 * 60 * 60 * 1000; // Subtract one day
      } else if (date < currentDate) {
        break;
      }
    }
    
    // Store longest streak
    const longestStreak = parseInt(localStorage.getItem('longestStreak') || '0');
    if (currentStreak > longestStreak) {
      localStorage.setItem('longestStreak', currentStreak.toString());
    }
    
    return currentStreak;
  };

  const calculateReadingPattern = (readArticles) => {
    if (readArticles.length === 0) {
      return {
        mostActiveDay: 'No data',
        averageDaily: 0,
        peakTime: 'No data'
      };
    }

    // Most Active Day: Group by day of week
    const dayCounts = {};
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    readArticles.forEach(article => {
      const dayName = dayNames[new Date(article.readAt).getDay()];
      dayCounts[dayName] = (dayCounts[dayName] || 0) + 1;
    });
    
    const mostActiveDay = Object.entries(dayCounts)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'No data';

    // Average Daily: Total articles ÷ distinct days
    const uniqueDays = new Set(
      readArticles.map(article => new Date(article.readAt).toDateString())
    ).size;
    const averageDaily = uniqueDays > 0 ? (readArticles.length / uniqueDays).toFixed(1) : 0;

    // Peak Time: Group by hour
    const hourCounts = {};
    readArticles.forEach(article => {
      const hour = new Date(article.readAt).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });
    
    const peakHour = Object.entries(hourCounts)
      .sort(([,a], [,b]) => b - a)[0]?.[0];
    
    const peakTime = peakHour !== undefined 
      ? `${peakHour > 12 ? peakHour - 12 : peakHour === 0 ? 12 : peakHour}:00 ${peakHour >= 12 ? 'PM' : 'AM'}`
      : 'No data';

    return { mostActiveDay, averageDaily, peakTime };
  };

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (!insights) {
    return (
      <div className="insights-page">
        <div className="loading-placeholder">
          <p>Loading insights...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="insights-page">
      <Navigation 
        currentPage="insights" 
        onCategoryChange={() => {}} 
        selectedCategory="All"
        onSearchChange={() => {}}
        onDateChange={() => {}}
        selectedDate=""
        userPreferences={[]}
      />
      
      <div className="insights-container-new">
        <div className="insights-header-new">
          <h1 className="insights-title-new">Your Reading Insights</h1>
          <p className="insights-subtitle">Discover your reading patterns and expand your horizons</p>
        </div>

        {/* Top Row: Topic Heatmap (Left) + Blindspot Alert (Right) */}
        <div className="insights-top-row-new">
          {/* Topic Heatmap */}
          <div className="insights-card-large">
            <div className="insights-card-header">
              <div className="insights-icon">📊</div>
              <div>
                <h3 className="insights-card-title">Topic Heatmap</h3>
                <p className="insights-card-subtitle">Your reading interests over last 30 days</p>
              </div>
            </div>
            <div className="topic-bars">
              {insights.topicHeatmap?.map((topic, index) => (
                <div key={index} className="topic-bar">
                  <span className="topic-name">{topic.topic}</span>
                  <div className="progress-track">
                    <div 
                      className="progress-fill" 
                      style={{ width: `${topic.percentage}%` }}
                    ></div>
                  </div>
                  <span className="topic-count">{topic.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Blindspot Alert */}
          <div className="insights-card-small">
            <div className="insights-card-header">
              <div className="insights-icon warning">⚠️</div>
              <div>
                <h3 className="insights-card-title">Blindspot Alert</h3>
              </div>
            </div>
            <div className="blindspot-content">
              <p>{insights.blindspotAlert}</p>
            </div>
          </div>
        </div>

        {/* Bottom Row: Time Saved (Green) + Daily Streak (Purple) + Reading Pattern (Blue) */}
        <div className="insights-bottom-row-new">
          {/* Time Saved */}
          <div className="insights-card-small time-saved-new">
            <div className="insights-card-header">
              <div className="insights-icon time">⏰</div>
              <div>
                <h3 className="insights-card-title">Time Saved</h3>
                <p className="insights-card-subtitle">Efficient reading</p>
              </div>
            </div>
            <div className="insights-metrics">
              <div className="insights-value-large green">{insights.timeSaved}</div>
              <div className="insights-label">Hours Saved</div>
              <div className="insights-sub-label">Based on {insights.totalArticles} articles read</div>
            </div>
          </div>

          {/* Daily Streak */}
          <div className="insights-card-small streak-new">
            <div className="insights-card-header">
              <div className="insights-icon streak">🔥</div>
              <div>
                <h3 className="insights-card-title">Daily Streak</h3>
                <p className="insights-card-subtitle">Reading consistency</p>
              </div>
            </div>
            <div className="insights-metrics">
              <div className="insights-value-large purple">{insights.streak}</div>
              <div className="insights-label">Current Streak</div>
              <div className="insights-sub-label">Longest: {insights.streak} days</div>
            </div>
          </div>

          {/* Reading Pattern */}
          <div className="insights-card-small pattern-new">
            <div className="insights-card-header">
              <div className="insights-icon pattern">📈</div>
              <div>
                <h3 className="insights-card-title">Reading Pattern</h3>
                <p className="insights-card-subtitle">Your reading habits</p>
              </div>
            </div>
            <div className="insights-pattern-details">
              <div className="pattern-row">
                <span>Most Active Day</span>
                <span>{insights.mostActiveDay}</span>
              </div>
              <div className="pattern-row">
                <span>Average Daily</span>
                <span>{insights.averageDaily}</span>
              </div>
              <div className="pattern-row">
                <span>Peak Time</span>
                <span>{insights.peakTime}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <footer className="footer">
        <h3>The Global Briefing</h3>
        <p>Curated summaries from trusted sources. Designed for readers who want signal, not noise.</p>
        <div className="footer-links">
          <a href="/" className="footer-link">Home</a>
          <span className="footer-separator">•</span>
          <span className="footer-text">Sources vary by category</span>
        </div>
      </footer>
    </div>
  );
}

// Library Page Component
function LibraryPage() {
  const [activeTab, setActiveTab] = useState('saved');
  const [likedStories, setLikedStories] = useState([]);
  const [savedStories, setSavedStories] = useState([]);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      loadLibraryData();
    }
  }, [user, activeTab]);

  const loadLibraryData = () => {
    try {
      const likedArticles = JSON.parse(localStorage.getItem('likedArticles') || '[]');
      const savedArticles = JSON.parse(localStorage.getItem('savedArticles') || '[]');
      
      setLikedStories(likedArticles);
      setSavedStories(savedArticles);
    } catch (error) {
      console.error('Error loading library data:', error);
    }
  };

  if (!user) {
    return <Navigate to="/login" />;
  }

  const displayStories = activeTab === 'liked' ? likedStories : savedStories;

  return (
    <div className="library-page">
      <Navigation 
        currentPage="library" 
        onCategoryChange={() => {}} 
        selectedCategory="All"
        onSearchChange={() => {}}
        onDateChange={() => {}}
        selectedDate=""
        userPreferences={[]}
      />
      
      <div className="library-container">
        <div className="library-header">
          <h1 className="section-heading">MY LIBRARY</h1>
          <p>Your personal collection of saved and liked stories</p>
        </div>

        <div className="library-tabs">
          <button 
            className={`library-tab ${activeTab === 'saved' ? 'active' : ''}`}
            onClick={() => setActiveTab('saved')}
          >
            <Bookmark size={16} />
            Saved Stories ({savedStories.length})
          </button>
          <button 
            className={`library-tab ${activeTab === 'liked' ? 'active' : ''}`}
            onClick={() => setActiveTab('liked')}
          >
            <Heart size={16} />
            Liked Stories ({likedStories.length})
          </button>
        </div>

        {displayStories.length === 0 ? (
          <div className="empty-library">
            <h3>No {activeTab} stories yet</h3>
            <p>
              {activeTab === 'saved' 
                ? 'Start saving stories you want to read later by clicking the bookmark icon.'
                : 'Start liking stories you enjoy by clicking the heart icon.'
              }
            </p>
            <Link to="/" className="browse-btn">Browse Stories</Link>
          </div>
        ) : (
          <div className="library-stories">
            {displayStories.map((story) => (
              <StoryCard key={story.story_id} story={story} />
            ))}
          </div>
        )}
      </div>

      <footer className="footer">
        <h3>The Global Briefing</h3>
        <p>Curated summaries from trusted sources. Designed for readers who want signal, not noise.</p>
        <div className="footer-links">
          <a href="#" className="footer-link">Home</a>
          <span className="footer-separator">•</span>
          <span className="footer-text">Sources vary by category</span>
        </div>
      </footer>
    </div>
  );
}

// Protected Route Component
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div className="loading">Loading...</div>;
  }
  
  if (!user) {
    return <Navigate to="/login" />;
  }
  
  return children;
}

// Login Route Protection Component
function LoginRoute() {
  const { user, loading } = useAuth();
  
  if (loading) return <div className="loading">Loading...</div>;
  if (user) return <Navigate to="/" replace />;
  
  return <LoginPage />;
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <div className="App">
          <Routes>
            <Route path="/login" element={<LoginRoute />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/insights" element={<InsightsPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/story/:id" element={<FullStoryPage />} />
            <Route path="/" element={<HomePage />} />
          </Routes>
        </div>
      </AuthProvider>
    </Router>
  );
}

// Full Story Page Component
function FullStoryPage() {
    const { id } = useParams();
    const [story, setStory] = useState(null);
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
      const fetchStory = async () => {
        try {
          const response = await fetch(`${API_BASE_URL}/api/stories/${id}`);
          if (response.ok) {
            const storyData = await response.json();
            setStory(storyData);
          }
        } catch (error) {
          console.error('Error fetching story:', error);
        } finally {
          setLoading(false);
        }
      };
      fetchStory();
    }, [id]);

    if (loading) return <div className="loading">Loading story...</div>;
    if (!story) return <div className="error">Story not found</div>;

    const formatDate = (dateStr) => {
      if (!dateStr) return '';
      return new Date(dateStr).toLocaleDateString('en-GB', {
        day: '2-digit', month: '2-digit', year: 'numeric'
      });
    };

    // Parse summary into structured sections
    const parseSummary = (text) => {
      if (!text) return { headline: '', body: [], fastFacts: [] };
      
      // Fix encoding first
      const fixedText = fixEncoding(text);
      
      // Split on newlines FIRST to preserve paragraph structure
      const rawLines = fixedText.split('\n');
      
      let headline = '';
      let body = [];
      let fastFacts = [];
      let inFastFacts = false;

      // Clean each line individually with the specified steps
      const cleanLine = (line) => {
        return line
          // a) Replace \*{4} (four asterisks) with space
          .replace(/\*{4}/g, ' ')
          // b) Replace /([^\s*])\*\*/g with '$1 '  (space before closing **)
          .replace(/([^\s*])\*\*/g, '$1 ')
          // c) Replace /\*\*([^\s*])/g with ' $1'  (space after opening **)
          .replace(/\*\*([^\s*])/g, ' $1')
          // d) Replace /\*/g with ''               (remove remaining asterisks)
          .replace(/\*/g, '')
          // e) Replace / {2,}/g with ' '           (collapse spaces)
          .replace(/ {2,}/g, ' ')
          // f) Replace / ('s|'s)/g with "'s"       (fix "Trump 's" -> "Trump's")
          .replace(/ ('s|'s)/g, "'s")
          // g) Replace / ([,\.;:!?])/g with '$1'   (fix "Monday ," -> "Monday,")
          .replace(/ ([,\.;:!?])/g, '$1')
          .trim();
      };

      rawLines.forEach((line, i) => {
        const trimmedLine = line.trim();
        if (!trimmedLine) return;

        if (i === 0) {
          // First line is headline
          headline = cleanLine(trimmedLine);
          return;
        }
        
        if (trimmedLine.toLowerCase() === 'fast facts') {
          inFastFacts = true;
          return;
        }
        
        if (inFastFacts && trimmedLine) {
          // Strip leading dashes/bullets from fast facts
          const clean = cleanLine(trimmedLine.replace(/^[-\u2022]\s*/, ''));
          if (clean) fastFacts.push(clean);
        } else if (!inFastFacts && trimmedLine) {
          // Add to body after cleaning
          const clean = cleanLine(trimmedLine);
          if (clean) body.push(clean);
        }
      });

      return { headline, body, fastFacts };
    };

    const { headline, body, fastFacts } = parseSummary(story.summary);

    return (
      <div className="full-story-page">
        <Navigation
          currentPage=""
          onCategoryChange={() => {}}
          selectedCategory="All"
          onSearchChange={() => {}}
          onDateChange={() => {}}
          selectedDate=""
          userPreferences={[]}
        />

        <div className="full-story-outer">
          {/* Cover Image */}
          {(story.cover_image || story.image_url) && (
            <div className="full-story-hero">
              <img
                src={story.cover_image || story.image_url}
                alt={story.title}
                className="full-story-hero-img"
              />
            </div>
          )}

          <div className="full-story-container">
            {/* Meta row */}
            <div className="full-story-meta">
              <h1 className="full-story-title">{story.title}</h1>
              <span className="full-story-date">{formatDate(story.published_at)}</span>
            </div>

            <hr className="full-story-divider" />

            {/* Headline sentence */}
            {headline && (
              <p className="full-story-headline">{headline}</p>
            )}

            {/* Body paragraphs */}
            <div className="full-story-body">
              {body.map((para, i) => (
                <p key={i} className="full-story-para">{para}</p>
              ))}
            </div>

            {/* Fast Facts */}
            {fastFacts.length > 0 && (
              <div className="full-story-facts">
                <h3 className="full-story-facts-title">Fast Facts</h3>
                <ul className="full-story-facts-list">
                  {fastFacts.map((fact, i) => (
                    <li key={i}>{fact}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Source link */}
            <div className="full-story-source">
              <a
                href={story.url}
                target="_blank"
                rel="noopener noreferrer"
                className="full-story-source-link"
              >
                Read Original Article
                <ArrowUpRight size={14} style={{ marginLeft: '4px' }} />
              </a>
            </div>
          </div>
        </div>

        <footer className="footer">
          <h3>The Global Briefing</h3>
          <p>Curated summaries from trusted sources. Designed for readers who want signal, not noise.</p>
          <div className="footer-links">
            <a href="/" className="footer-link">Home</a>
            <span className="footer-separator">\u2022</span>
            <span className="footer-text">Sources vary by category</span>
          </div>
        </footer>
      </div>
    );
  }

// Onboarding Page Component
function OnboardingPage() {
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const { user } = useAuth();
  const navigate = useNavigate();

  // Professional category descriptions
  const categoryDescriptions = {
    'Technology': 'The pulse of innovation, from Silicon Valley to the future of AI.',
    'Politics': 'Unbiased coverage of the shifts and power plays shaping our world.',
    'Business': 'Market moves and economic insights to keep you ahead of the curve.',
    'Sports': 'Beyond the scoreboard: the stories and strategy behind the game.',
    'Health': 'Cutting-edge wellness and medical breakthroughs for a longer life.',
    'Science': 'Exploring the frontiers of the known universe and human discovery.',
    'World News': 'A global lens on the events that connect us across borders.'
  };

  const handleCategoryToggle = (category) => {
    if (selectedCategories.includes(category)) {
      setSelectedCategories(selectedCategories.filter(cat => cat !== category));
    } else {
      setSelectedCategories([...selectedCategories, category]);
    }
  };

  const handleSave = async () => {
    if (selectedCategories.length < 2) {
      return;
    }

    setIsSaving(true);
    try {
      const token = localStorage.getItem('token');
      
      // Token guard - if no token, redirect to login
      if (!token) {
        navigate('/login');
        return;
      }
      
      const response = await fetch(`${API_BASE_URL}/api/preferences`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ preferences: selectedCategories })
      });

      if (response.ok) {
        // Success - force main page to load with new interests
        window.location.assign('/');
      } else {
        // Handle server error
        throw new Error('Server returned error response');
      }
    } catch (error) {
      console.error('Error saving preferences:', error);
      // Show toast notification
      setToastMessage('Unable to save preferences. Please check your connection.');
      setShowToast(true);
      // Hide toast after 3 seconds
      setTimeout(() => {
        setShowToast(false);
      }, 3000);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="onboarding-page">
      <div className="onboarding-container">
        <div className="onboarding-header">
          <h1 className="logo-large">The Global Briefing</h1>
          <p>Join circle of informed leaders. One curated briefing, every single day.</p>
          <p>Select at least 2 topics to personalize your daily briefing</p>
        </div>
        
        <div className="interests-grid">
          {CATEGORIES.filter(cat => cat !== 'All').map(category => (
            <div
              key={category}
              className={`interest-card ${selectedCategories.includes(category) ? 'selected' : ''}`}
              onClick={() => handleCategoryToggle(category)}
            >
              <h3 className="category-name">{category}</h3>
              <p className="category-description">{categoryDescriptions[category]}</p>
            </div>
          ))}
        </div>
        
        <div className="onboarding-footer">
          <button 
            className={`continue-btn ${selectedCategories.length >= 2 ? 'active' : ''}`}
            onClick={handleSave}
            disabled={isSaving || selectedCategories.length < 2}
          >
            {isSaving ? (
              <>
                <span className="spinner"></span>
                Saving...
              </>
            ) : (
              `Continue (${selectedCategories.length}/2)`
            )}
          </button>
        </div>
        
        {/* Toast Notification */}
        {showToast && (
          <div className="toast-notification error">
            {toastMessage}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
