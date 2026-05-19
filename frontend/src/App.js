import React, { useState, useEffect, useContext, useRef, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { Search, Calendar, TrendingUp, Library, LogOut, Mail, Lock, User, Heart, Bookmark, ArrowUpRight, Share, X } from 'lucide-react';
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
              placeholder="Search stories..."
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
    </>
  );
}

function HomePage() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const dateInputRef = useRef(null);
  const [stories, setStories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState(null);
  const [storiesLoading, setStoriesLoading] = useState(true);
  const [userPreferences, setUserPreferences] = useState([]);
  
  // useMemo must be called unconditionally at component top
  const displayedStories = useMemo(() => {
    let result = stories  // start with ALL stories
    
    // Only filter by date if user selected one
    if (selectedDate) {
      result = result.filter(s => 
        s.published_at && s.published_at.startsWith(selectedDate)
      )
    }
    
    // Only filter by category if not 'All'
    if (selectedCategory && selectedCategory !== 'All') {
      result = result.filter(s =>
        s.category && 
        s.category.toLowerCase() === selectedCategory.toLowerCase()
      )
    }
    
    return result
  }, [stories, selectedDate, selectedCategory]);

  console.log('HomePage - User state:', user);

  useEffect(() => {
    if (user) {
      fetchUserPreferences();
    }
  }, [user]);

  useEffect(() => {
    setStoriesLoading(true)
    
    const url = selectedDate
      ? `/api/stories?date=${selectedDate}` 
      : '/api/stories'
    
    fetch(url)
      .then(res => res.json())
      .then(data => {
        const allStories = Array.isArray(data) ? data : 
                           data.stories || []
        setStories(allStories)
        setStoriesLoading(false)
      })
      .catch(err => {
        console.error('Stories fetch error:', err)
        setStories([])
        setStoriesLoading(false)
      })
  }, [selectedDate]);

  useEffect(() => {
    const timeout = setTimeout(() => setStoriesLoading(false), 8000)
    return () => clearTimeout(timeout)
  }, [])

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
      if (selectedCategory && selectedCategory !== "All") {
        params.append('category', selectedCategory);
      }
      if (searchQuery.trim()) {
        params.append('search', searchQuery);
      }
      if (selectedDate) {
        params.append('date', selectedDate);
      }
      
      const url = selectedDate 
      ? `${API_BASE_URL}/api/stories?${params.toString()}` 
      : `${API_BASE_URL}/api/stories`;
      
      console.log('DEBUG: API URL:', url);
      const response = await fetch(url, { headers });
      console.log('DEBUG: Response status:', response.status);
      const data = await response.json();
      console.log('DEBUG: Stories received:', data);
      console.log('DEBUG: selectedDate state:', selectedDate);
      console.log('DEBUG: API URL called:', url);
      
      // Log article date fields for debugging
      if (Array.isArray(data) && data.length > 0) {
        console.log('DEBUG: Sample article date fields:');
        data.slice(0, 3).forEach((Article, index) => {
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

  const handleUpdateStory = (storyId, updates) => {
    setStories(prev => prev.map(story => 
      story.story_id === storyId 
        ? { ...story, ...updates }
        : story
    ));
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
        selectedDate=""
        userPreferences={userPreferences}
        onSearchTrigger={fetchStories}
      />
      
      {/* Morning Brew Style Blue Hero Banner - Only on Homepage */}
      {location.pathname === '/' && (
        <div className="hero-banner-blue">
          <div className="hero-content-blue">
            <div className="hero-left-blue">
              <h2 className="hero-heading-blue">Stay informed in 5 minutes</h2>
              <p className="hero-subtitle-blue">The Global Briefing delivers sharp, AI-curated news across 8 categories every morning.</p>
            </div>
            <div className="hero-right-blue">
              <div className="hero-date-large">FRIDAY</div>
              <div className="hero-date-small">May 9, 2026</div>
            </div>
          </div>
        </div>
      )}
      <CategoryBar selectedCategory={selectedCategory} onCategoryChange={handleCategoryChange} />
      
      {/* Date Picker */}
      <div className="date-picker-container">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ 
            fontSize: '15px', 
            fontWeight: '600', 
            color: '#111827' 
          }}>
            {selectedDate 
              ? `Viewing: ${new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { 
                  month: 'long', 
                  day: 'numeric', 
                  year: 'numeric' 
                })}`
              : 'All Stories'}
          </span>
          
          {selectedDate && (
            <button
              onClick={() => setSelectedDate(null)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#9CA3AF',
                fontSize: '20px',
                lineHeight: 1,
                padding: '0 4px'
              }}
            >×</button>
          )}
        </div>
        
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <input
            ref={dateInputRef}
            type="date"
            value={selectedDate || ''}
            onChange={(e) => setSelectedDate(e.target.value || null)}
            style={{
              position: 'absolute',
              opacity: 0,
              pointerEvents: 'none',
              width: '1px',
              height: '1px'
            }}
          />
          <button
            onClick={() => dateInputRef.current?.showPicker?.()}
            style={{
              width: '36px',
              height: '36px',
              border: '1px solid #E5E7EB',
              borderRadius: '8px',
              background: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px'
            }}
          >
            📅
          </button>
        </div>
      </div>
      
      <div className="content-area">
        {!storiesLoading && Array.isArray(stories) && stories.length > 0 && (
          <>
            <h2 className="section-heading">
              {searchQuery.trim() ? 'SEARCH RESULTS' : 'Today\'s Briefing'}
            </h2>
                      </>
        )}
        
        {/* Featured Story - only show for All category and no search */}
        {!storiesLoading && Array.isArray(stories) && stories.length > 0 && selectedCategory === 'All' && !searchQuery.trim() && (
          <FeaturedStory story={stories[0]} onUpdateStory={handleUpdateStory} />
        )}
        
        {/* Regular Stories Grid */}
        <div className="stories-grid">
          {storiesLoading ? (
            <div className="loading-placeholder"><p>Loading stories...</p></div>
          ) : !Array.isArray(stories) || stories.length === 0 ? (
            <div className="no-stories-placeholder">
              <div className="empty-state-icon">📰</div>
              <h3 className="empty-state-title">
                {searchQuery.trim() ? 'No search results found' : 'No stories found'}
              </h3>
              <p className="empty-state-subtext">
                {searchQuery.trim() 
                  ? 'Try searching for a different topic or keyword.'
                  : 'Try selecting a different category or date'
                }
              </p>
            </div>
          ) : (
            displayedStories
              .map((story, index) => {
                // Skip the first story if it's featured
                const storyIndex = selectedCategory === 'All' && !searchQuery.trim() && index === 0 ? null : story;
                return storyIndex && <StoryCard key={storyIndex.story_id} story={storyIndex} onUpdateStory={handleUpdateStory} />;
              })
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
    <div className="category-bar-container">
      <div className="category-bar">
        {CATEGORIES.map(category => (
          <button
            key={category}
            className={`category-tab ${selectedCategory === category ? 'active' : ''}`}
            onClick={() => onCategoryChange(category)}
          >
            {category}
          </button>
        ))}
      </div>
    </div>
  );
}

function StoryCard({ story, onUpdateStory }) {
    const [isLiked, setIsLiked] = useState(false);
    const [isSaved, setIsSaved] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const { user } = useAuth();
    const navigate = useNavigate();

    // Calculate reading time based on summary word count
    const calculateReadingTime = (summary) => {
      if (!summary) return '1';
      const wordCount = summary.split(/\s+/).length;
      const readingTime = Math.ceil(wordCount / 200);
      return readingTime.toString();
    };

    // Check localStorage on mount
    useEffect(() => {
      const likedStories = JSON.parse(localStorage.getItem('likedStories') || '[]');
      const savedStories = JSON.parse(localStorage.getItem('savedStories') || '[]');
      setIsLiked(likedStories.includes(story.story_id));
      setIsSaved(savedStories.includes(story.story_id));
    }, [story.story_id]);

    const handleLike = async (e) => {
      e.stopPropagation();
      if (isProcessing) return;
      setIsProcessing(true);
      
      // Optimistic update first
      const newLikesCount = isLiked ? (story.likes_count || 1) - 1 : (story.likes_count || 0) + 1;
      onUpdateStory(story.story_id, { likes_count: newLikesCount });
      
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/stories/${story.story_id}/like`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          
          // Update localStorage tracking
          const likedStories = JSON.parse(localStorage.getItem('likedStories') || '[]');
          if (isLiked) {
            // Remove from liked stories
            const newLikedStories = likedStories.filter(id => id !== story.story_id);
            localStorage.setItem('likedStories', JSON.stringify(newLikedStories));
          } else {
            // Add to liked stories
            likedStories.push(story.story_id);
            localStorage.setItem('likedStories', JSON.stringify(likedStories));
          }
          
          setIsLiked(!isLiked);
          
          // Update with real count from server
          onUpdateStory(story.story_id, { 
            likes_count: data.likes_count,
            saves_count: data.saves_count
          });
        }
      } catch (error) {
        console.error('Error liking story:', error);
        // Revert optimistic update on error
        const revertLikesCount = isLiked ? (story.likes_count || 0) + 1 : (story.likes_count || 1) - 1;
        onUpdateStory(story.story_id, { likes_count: revertLikesCount });
      } finally {
        setIsProcessing(false);
      }
    };

    const handleSave = async (e) => {
      e.stopPropagation();
      if (isProcessing) return;
      setIsProcessing(true);
      
      // Optimistic update first
      const newSavesCount = isSaved ? (story.saves_count || 1) - 1 : (story.saves_count || 0) + 1;
      onUpdateStory(story.story_id, { saves_count: newSavesCount });
      
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/stories/${story.story_id}/save`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          
          // Update localStorage tracking
          const savedStories = JSON.parse(localStorage.getItem('savedStories') || '[]');
          if (isSaved) {
            // Remove from saved stories
            const newSavedStories = savedStories.filter(id => id !== story.story_id);
            localStorage.setItem('savedStories', JSON.stringify(newSavedStories));
          } else {
            // Add to saved stories
            savedStories.push(story.story_id);
            localStorage.setItem('savedStories', JSON.stringify(savedStories));
          }
          
          setIsSaved(!isSaved);
          
          // Update with real count from server
          onUpdateStory(story.story_id, { 
            likes_count: data.likes_count,
            saves_count: data.saves_count
          });
        }
      } catch (error) {
        console.error('Error saving story:', error);
        // Revert optimistic update on error
        const revertSavesCount = isSaved ? (story.saves_count || 0) + 1 : (story.saves_count || 1) - 1;
        onUpdateStory(story.story_id, { saves_count: revertSavesCount });
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
    const date = new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return date;
  };

    // Strip markdown bold markers for the card preview - show only headline
    const stripMarkdown = (text) => {
      if (!text) return '';
      
      // Fix encoding first
      const fixedText = fixEncoding(text);
      
      // Split on newlines to get lines
      const rawLines = fixedText.split('\n');
      
      // Get first non-empty line as headline
      const firstLine = rawLines.find(line => line.trim() !== '');
      if (!firstLine) return '';
      
      // Clean the headline line
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

      const cleanedHeadline = cleanLine(firstLine);
      
      // Truncate if too long
      return cleanedHeadline.length > 120 ? cleanedHeadline.slice(0, 120) + '...' : cleanedHeadline;
    };

    return (
      <div className="story-card" onClick={handleCardClick}>
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
          {/* Category Badge - moved inside card */}
          <div className="story-category-badge">
            {story.category}
          </div>
          
          <h3 className="story-card-title">{story.title}</h3>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '13px',
            color: '#9CA3AF',
            marginBottom: '8px'
          }}>
            <span>{formatDate(story.published_at, story.fetched_at)}</span>
            <span>·</span>
            <span>{calculateReadingTime(story.summary)} min read</span>
          </div>
          <p className="story-card-excerpt">{story.summary ? stripMarkdown(story.summary) : ''}</p>
          <div className="story-card-footer">
            <div className="story-source">
              {story.source}
            </div>
            {user && (
              <div className="story-card-actions">
                <button
                  className={`action-btn ${isLiked ? 'active' : ''}`}
                  onClick={handleLike}
                  disabled={isProcessing}
                  title="Like"
                >
                  <Heart size={15} fill={isLiked ? 'currentColor' : 'none'} />
                  <span className="action-count">{story.likes_count || 0}</span>
                </button>
                <button
                  className={`action-btn ${isSaved ? 'active' : ''}`}
                  onClick={handleSave}
                  disabled={isProcessing}
                  title="Save"
                >
                  <Bookmark size={15} fill={isSaved ? 'currentColor' : 'none'} />
                  <span className="action-count">{story.saves_count || 0}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

// Featured Story Component
function FeaturedStory({ story, onUpdateStory }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isLiked, setIsLiked] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (user) {
      const likedStories = JSON.parse(localStorage.getItem('likedStories') || '[]');
      const savedStories = JSON.parse(localStorage.getItem('savedStories') || '[]');
      setIsLiked(likedStories.includes(story.story_id));
      setIsSaved(savedStories.includes(story.story_id));
    }
  }, [user, story.story_id]);

  const handleCardClick = () => {
    if (user) {
      try {
        const readArticles = JSON.parse(localStorage.getItem('readArticles') || '[]');
        const alreadyRead = readArticles.some(article => article.story_id === story.story_id);
        
        if (!alreadyRead) {
          const newReadArticle = {
            story_id: story.story_id,
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
    }
    
    navigate(`/story/${story.story_id}`);
  };

  const formatDate = (dateStr, fallback) => {
    const d = dateStr || fallback;
    if (!d) return 'Recent';
    const date = new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return date;
  };

  const calculateReadingTime = (summary) => {
    if (!summary) return '1';
    const wordsPerMinute = 200;
    const wordCount = summary.split(/\s+/).length;
    const readingTime = Math.ceil(wordCount / wordsPerMinute);
    return readingTime.toString();
  };

  const handleLike = async (e) => {
    e.stopPropagation();
    if (isProcessing) return;
    setIsProcessing(true);
    
    // Optimistic update first
    const newLikesCount = isLiked ? (story.likes_count || 1) - 1 : (story.likes_count || 0) + 1;
    onUpdateStory(story.story_id, { likes_count: newLikesCount });
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/stories/${story.story_id}/like`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // Update localStorage tracking
        const likedStories = JSON.parse(localStorage.getItem('likedStories') || '[]');
        if (isLiked) {
          // Remove from liked stories
          const newLikedStories = likedStories.filter(id => id !== story.story_id);
          localStorage.setItem('likedStories', JSON.stringify(newLikedStories));
        } else {
          // Add to liked stories
          likedStories.push(story.story_id);
          localStorage.setItem('likedStories', JSON.stringify(likedStories));
        }
        
        setIsLiked(!isLiked);
        
        // Update with real count from server
        onUpdateStory(story.story_id, { 
          likes_count: data.likes_count,
          saves_count: data.saves_count
        });
      }
    } catch (error) {
      console.error('Error liking story:', error);
      // Revert optimistic update on error
      const revertLikesCount = isLiked ? (story.likes_count || 0) + 1 : (story.likes_count || 1) - 1;
      onUpdateStory(story.story_id, { likes_count: revertLikesCount });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSave = async (e) => {
    e.stopPropagation();
    if (isProcessing) return;
    setIsProcessing(true);
    
    // Optimistic update first
    const newSavesCount = isSaved ? (story.saves_count || 1) - 1 : (story.saves_count || 0) + 1;
    onUpdateStory(story.story_id, { saves_count: newSavesCount });
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/stories/${story.story_id}/save`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // Update localStorage tracking
        const savedStories = JSON.parse(localStorage.getItem('savedStories') || '[]');
        if (isSaved) {
          // Remove from saved stories
          const newSavedStories = savedStories.filter(id => id !== story.story_id);
          localStorage.setItem('savedStories', JSON.stringify(newSavedStories));
        } else {
          // Add to saved stories
          savedStories.push(story.story_id);
          localStorage.setItem('savedStories', JSON.stringify(savedStories));
        }
        
        setIsSaved(!isSaved);
        
        // Update with real count from server
        onUpdateStory(story.story_id, { 
          likes_count: data.likes_count,
          saves_count: data.saves_count
        });
      }
    } catch (error) {
      console.error('Error saving story:', error);
      // Revert optimistic update on error
      const revertSavesCount = isSaved ? (story.saves_count || 0) + 1 : (story.saves_count || 1) - 1;
      onUpdateStory(story.story_id, { saves_count: revertSavesCount });
    } finally {
      setIsProcessing(false);
    }
  };

  const stripMarkdown = (text) => {
    if (!text) return '';
    
    const fixedText = text;
    const rawLines = fixedText.split('\n');
    const firstLine = rawLines.find(line => line.trim() !== '');
    if (!firstLine) return '';
    
    const cleanLine = (line) => {
      return line
        .replace(/\*{4}/g, ' ')
        .replace(/([^\s*])\*\*/g, '$1 ')
        .replace(/\*\*([^\s*])/g, ' $1')
        .replace(/\*/g, '')
        .replace(/ {2,}/g, ' ')
        .replace(/ ('s|'s)/g, "'s")
        .replace(/ ([,\.;:!?])/g, '$1')
        .trim();
    };

    const cleanedHeadline = cleanLine(firstLine);
    return cleanedHeadline.length > 200 ? cleanedHeadline.slice(0, 200) + '...' : cleanedHeadline;
  };

  return (
    <div className="featured-story" onClick={handleCardClick}>
      <div className="featured-story-image">
        {(story.cover_image || story.image_url) && (
          <img
            src={story.cover_image || story.image_url}
            alt={story.title}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        )}
      </div>
      <div className="featured-story-content">
        <div className="story-category-badge">
          {story.category}
        </div>
        
        <h2 className="featured-story-title">{story.title}</h2>
        
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '13px',
          color: '#9CA3AF',
          marginBottom: '12px'
        }}>
          <span>{formatDate(story.published_at, story.fetched_at)}</span>
          <span>·</span>
          <span>{calculateReadingTime(story.summary)} min read</span>
        </div>
        
        <p className="featured-story-excerpt">
          {story.summary ? stripMarkdown(story.summary) : ''}
        </p>
        
        <div className="featured-story-footer">
          <div className="story-source">
            {story.source}
          </div>
          {user && (
            <div className="story-card-actions">
              <button
                className={`action-btn ${isLiked ? 'active' : ''}`}
                onClick={handleLike}
                disabled={isProcessing}
                title="Like"
              >
                <Heart size={15} fill={isLiked ? 'currentColor' : 'none'} />
                <span className="action-count">{story.likes_count || 0}</span>
              </button>
              <button
                className={`action-btn ${isSaved ? 'saved' : ''}`}
                onClick={handleSave}
                disabled={isProcessing}
                title="Save"
              >
                <Bookmark size={15} fill={isSaved ? 'currentColor' : 'none'} />
                <span className="action-count">{story.saves_count || 0}</span>
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
  const [topLiked, setTopLiked] = useState([]);
  const [topSaved, setTopSaved] = useState([]);
  const [todayCoverage, setTodayCoverage] = useState(null);
  const [storiesRead, setStoriesRead] = useState([]);
  const [error, setError] = useState(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Fetch fresh data immediately on load
    fetchInsightsData();
    
    // Then refresh every 30 seconds
    const interval = setInterval(() => {
      fetchInsightsData();
    }, 30000);
    
    // Force stop loading after 5 seconds no matter what
    const timeout = setTimeout(() => {
      setInsights(prev => ({ ...prev, loading: false }));
    }, 5000);
    
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);

  const fetchInsightsData = async () => {
    try {
      // Fetch top liked and saved stories
      const [topLikedRes, topSavedRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/stories/top-liked`),
        fetch(`${API_BASE_URL}/api/stories/top-saved`)
      ]);

      if (topLikedRes.ok) {
        const likedData = await topLikedRes.json();
        setTopLiked(likedData);
      } else {
        throw new Error('Failed to fetch top liked stories');
      }

      if (topSavedRes.ok) {
        const savedData = await topSavedRes.json();
        setTopSaved(savedData);
      } else {
        throw new Error('Failed to fetch top saved stories');
      }

      // Get read stories from localStorage
      const readStories = JSON.parse(localStorage.getItem('readStories') || '[]');
      setStoriesRead(readStories);

      // Calculate local insights
      calculateInsights();
    } catch (error) {
      console.error('Error fetching insights data:', error);
      setError(error.message || 'Failed to load insights');
    } finally {
      // Always set loading to false
      setInsights(prev => ({ ...prev, loading: false }));
    }
  };

  const calculateInsights = () => {
    try {
      const readArticles = JSON.parse(localStorage.getItem('readArticles') || '[]');
      const todayReadArticles = JSON.parse(localStorage.getItem('readStories') || '[]');
      
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
      
      const totalReads = Object.values(topicCounts).reduce((sum, count) => sum + count, 0);
      const topicHeatmap = Object.entries(topicCounts)
        .map(([topic, count]) => ({ 
          topic, 
          count, 
          percentage: totalReads > 0 ? Math.round((count / totalReads) * 100) : 0 
        }))
        .sort((a, b) => b.count - a.count);

      // Blindspot Alert: Find all categories not read recently
      const recentCategoryCounts = {};
      recentReadArticles.forEach(article => {
        const category = article.category || 'Other';
        const normalizedCategory = category.toLowerCase();
        recentCategoryCounts[normalizedCategory] = (recentCategoryCounts[normalizedCategory] || 0) + 1;
      });
      
      const allCategoriesNormalized = ['technology', 'politics', 'business', 'sports', 'health', 'science', 'world', 'entertainment'];
      const blindspotCategories = allCategoriesNormalized.filter(normalizedCat => 
        !recentCategoryCounts[normalizedCat] || recentCategoryCounts[normalizedCat] === 0
      );

      // Daily Streak: Calculate consecutive days with at least one article read
      const streak = calculateDailyStreak(readArticles);

      // Stories Read Today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const todayReadCount = todayReadArticles.filter(storyId => {
        // This would need to be enhanced with timestamps for proper today tracking
        return true; // For now, count all read stories
      }).length;

      // Today's Coverage (mock data - would come from API)
      const coverageData = {
        totalStories: 25,
        categories: [
          { name: 'Technology', count: 8 },
          { name: 'Politics', count: 6 },
          { name: 'Business', count: 5 },
          { name: 'Health', count: 3 },
          { name: 'Science', count: 2 },
          { name: 'Sports', count: 1 }
        ]
      };

      setStoriesRead(todayReadArticles);
      setTodayCoverage(coverageData);

      setInsights({
        topicHeatmap,
        blindspotCategories,
        streak,
        totalArticles: readArticles.length,
        todayReadCount,
        hasReadToday
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

  if (error) {
    return (
      <div className="insights-page">
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          color: '#6B7280'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
          <h3 style={{ fontSize: '18px', color: '#111827', marginBottom: '8px' }}>
            Unable to load insights
          </h3>
          <p style={{ fontSize: '14px' }}>
            Make sure the backend is running on port 5000
          </p>
          <button 
            onClick={() => {
              setError(null);
              fetchInsightsData();
            }}
            style={{
              marginTop: '16px',
              padding: '8px 20px',
              background: '#111827',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            Try Again
          </button>
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
      
      <div className="insights-grid">
        {/* Reading Streak - Prominent */}
        <div className="insights-card streak-card">
          <div className="streak-content">
            <div className="streak-number">{insights.streak}</div>
            <div className="streak-label">Reading Streak</div>
            <div className="streak-sublabel">Days in a row</div>
          </div>
          <div className="streak-icon">{insights.streak > 0 ? '🔥' : '📖'}</div>
        </div>

        {/* Your Reading Interests */}
        <div className="insights-card">
          <div className="card-header">
            <h3>Your Reading Interests</h3>
            <p className="card-subtitle">Last 30 days</p>
          </div>
          <div className="topic-bars">
            {insights.topicHeatmap?.map((topic, index) => {
              const categoryColors = {
                'Technology': '#3B82F6',
                'Politics': '#EF4444', 
                'Business': '#10B981',
                'Sports': '#F59E0B',
                'Health': '#8B5CF6',
                'Science': '#06B6D4',
                'World': '#F97316',
                'Entertainment': '#EC4899'
              };
              const color = categoryColors[topic.topic] || '#6B7280';
              
              return (
                <div key={index} className="topic-bar">
                  <span className="topic-name">{topic.topic}</span>
                  <div className="progress-track">
                    <div 
                      className="progress-fill" 
                      style={{ width: `${Math.min(topic.percentage, 100)}%`, backgroundColor: color }}
                    ></div>
                  </div>
                  <span className="topic-count">{topic.count} ({topic.percentage}%)</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Most Read Today */}
        <div className="insights-card">
          <div className="card-header">
            <h3>Most Read Today</h3>
            <p className="card-subtitle">Top liked stories</p>
          </div>
          <div className="top-stories">
            {topLiked.length > 0 ? (
              topLiked.map((story, index) => (
                <div 
                  key={index} 
                  className="top-story-item clickable"
                  onClick={() => navigate(`/story/${story.story_id}`)}
                  style={{
                    cursor: 'pointer',
                    padding: '10px 0',
                    borderBottom: '1px solid #F3F4F6'
                  }}
                >
                  <div className="story-info">
                    <div className="story-title">{story.title.substring(0, 60)}...</div>
                    <div className="story-meta">
                      <span className="story-category">{story.category}</span>
                      <span className="story-likes" style={{ fontWeight: '600', color: '#DC2626' }}>{story.likes_count}</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="no-data">No stories liked today</div>
            )}
          </div>
        </div>

        {/* Most Saved Today */}
        <div className="insights-card">
          <div className="card-header">
            <h3>Most Saved Today</h3>
            <p className="card-subtitle">Top bookmarked stories</p>
          </div>
          <div className="top-stories">
            {topSaved.length > 0 ? (
              topSaved.map((story, index) => (
                <div 
                  key={index} 
                  className="top-story-item clickable"
                  onClick={() => navigate(`/story/${story.story_id}`)}
                  style={{
                    cursor: 'pointer',
                    padding: '10px 0',
                    borderBottom: '1px solid #F3F4F6'
                  }}
                >
                  <div className="story-info">
                    <div className="story-title">{story.title.substring(0, 60)}...</div>
                    <div className="story-meta">
                      <span className="story-category">{story.category}</span>
                      <span className="story-saves" style={{ fontWeight: '600', color: '#059669' }}>{story.saves_count}</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="no-data">No stories saved today</div>
            )}
          </div>
        </div>

        {/* Today's Coverage */}
        <div className="insights-card">
          <div className="card-header">
            <h3>Today's Coverage</h3>
            <p className="card-subtitle">Stories by category</p>
          </div>
          <div className="coverage-content">
            <div className="coverage-summary">
              Today's briefing covers <strong>{todayCoverage?.totalStories || 25}</strong> stories across <strong>{todayCoverage?.categories?.length || 6}</strong> categories
            </div>
            <div className="coverage-grid">
              {todayCoverage?.categories?.map((cat, index) => {
                const categoryColors = {
                  'Technology': { bg: '#3B82F6', text: 'white' },
                  'Politics': { bg: '#EF4444', text: 'white' },
                  'Business': { bg: '#10B981', text: 'white' },
                  'Sports': { bg: '#F59E0B', text: 'white' },
                  'Health': { bg: '#8B5CF6', text: 'white' },
                  'Science': { bg: '#06B6D4', text: 'white' },
                  'World': { bg: '#F97316', text: 'white' },
                  'Entertainment': { bg: '#EC4899', text: 'white' }
                };
                const colors = categoryColors[cat.name] || { bg: '#6B7280', text: 'white' };
                
                return (
                  <div 
                    key={index} 
                    className="coverage-category clickable"
                    onClick={() => navigate(`/?category=${cat.name}`)}
                    style={{
                      cursor: 'pointer',
                      background: colors.bg,
                      color: colors.text,
                      padding: '8px 16px',
                      borderRadius: '8px',
                      fontWeight: '600',
                      fontSize: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'all 0.15s ease',
                      border: '1px solid transparent'
                    }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                  >
                    {cat.name} <span style={{
                      background: 'rgba(0,0,0,0.1)',
                      borderRadius: '4px',
                      padding: '1px 6px',
                      fontSize: '12px'
                    }}>{cat.count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Stories Read */}
        <div className="insights-card">
          <div className="card-header">
            <h3>Stories Read</h3>
            <p className="card-subtitle">Your progress today</p>
          </div>
          <div className="stories-read-content">
            <div className="read-progress">
              <div className="progress-summary">
                You've read <strong>{storiesRead.length}</strong> of <strong>{todayCoverage?.totalStories || 25}</strong> stories
              </div>
              <div className="progress-bar">
                <div 
                  className="progress-fill-read" 
                  style={{ width: `${Math.min((storiesRead.length / (todayCoverage?.totalStories || 25)) * 100, 100)}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {/* Blindspot Alert */}
        <div className="insights-card">
          <div className="card-header">
            <h3>Blindspot Alert</h3>
            <p className="card-subtitle">Categories to explore</p>
          </div>
          <div className="blindspot-content">
            {insights.blindspotCategories?.length > 0 ? (
              <div className="blindspot-pills">
                {insights.blindspotCategories.map((category, index) => (
                  <span key={index} className="blindspot-pill">
                    {category.charAt(0).toUpperCase() + category.slice(1)}
                  </span>
                ))}
              </div>
            ) : (
              <div className="no-blindspot">
                Great job! You're reading a diverse range of topics.
              </div>
            )}
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

  const loadLibraryData = async () => {
    try {
      const likedStoryIds = JSON.parse(localStorage.getItem('likedStories') || '[]');
      const savedStoryIds = JSON.parse(localStorage.getItem('savedStories') || '[]');
      
      // Fetch fresh story data from API to get current likes_count and saves_count
      const token = localStorage.getItem('token');
      
      if (likedStoryIds.length > 0) {
        const likedPromises = likedStoryIds.map(storyId => 
          fetch(`${API_BASE_URL}/api/stories/${storyId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }).then(res => res.json()).catch(() => null)
        );
        const likedData = await Promise.all(likedPromises);
        setLikedStories(likedData.filter(story => story !== null));
      } else {
        setLikedStories([]);
      }
      
      if (savedStoryIds.length > 0) {
        const savedPromises = savedStoryIds.map(storyId => 
          fetch(`${API_BASE_URL}/api/stories/${storyId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }).then(res => res.json()).catch(() => null)
        );
        const savedData = await Promise.all(savedPromises);
        setSavedStories(savedData.filter(story => story !== null));
      } else {
        setSavedStories([]);
      }
    } catch (error) {
      console.error('Error loading library data:', error);
      // Fallback to localStorage data
      const likedStoryIds = JSON.parse(localStorage.getItem('likedStories') || '[]');
      const savedStoryIds = JSON.parse(localStorage.getItem('savedStories') || '[]');
      setLikedStories(likedStoryIds);
      setSavedStories(savedStoryIds);
    }
  };

  if (!user) {
    return <Navigate to="/login" />;
  }

  const displayStories = activeTab === 'liked' ? likedStories : savedStories;

  // Update story in library after like/save action
  const updateLibraryStory = (storyId, updates) => {
    setLikedStories(prev => prev.map(story => 
      story.story_id === storyId ? { ...story, ...updates } : story
    ));
    setSavedStories(prev => prev.map(story => 
      story.story_id === storyId ? { ...story, ...updates } : story
    ));
  };

  // Remove story from library
  const removeFromLibrary = (storyId, type) => {
    if (type === 'liked') {
      setLikedStories(prev => prev.filter(story => story.story_id !== storyId));
      // Update localStorage
      const likedStories = JSON.parse(localStorage.getItem('likedStories') || '[]');
      const newLikedStories = likedStories.filter(id => id !== storyId);
      localStorage.setItem('likedStories', JSON.stringify(newLikedStories));
    } else if (type === 'saved') {
      setSavedStories(prev => prev.filter(story => story.story_id !== storyId));
      // Update localStorage
      const savedStories = JSON.parse(localStorage.getItem('savedStories') || '[]');
      const newSavedStories = savedStories.filter(id => id !== storyId);
      localStorage.setItem('savedStories', JSON.stringify(newSavedStories));
    }
  };

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
          <h1 className="library-title">My Library</h1>
          <p className="library-subtitle">Your saved and liked stories</p>
          <div className="library-divider"></div>
        </div>

        <div className="library-tabs-container">
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
        </div>

        <div className="library-count-summary">
          {savedStories.length} stories saved  ·  {likedStories.length} stories liked
        </div>

        {displayStories.length === 0 ? (
          <div className="empty-library">
            <div className="empty-icon">
              {activeTab === 'saved' ? <Bookmark size={48} /> : <Heart size={48} />}
            </div>
            <h3>No {activeTab === 'saved' ? 'saved' : 'liked'} stories yet</h3>
            <p>
              {activeTab === 'saved' 
                ? 'Click the bookmark icon on any story to save it here'
                : 'Click the heart icon on any story to like it'
              }
            </p>
            <Link to="/" className="browse-btn">Browse Stories</Link>
          </div>
        ) : (
          <div className="library-stories">
            {displayStories.map((story) => (
              <div key={story.story_id} className="library-story-card">
                <button 
                  className="remove-from-library"
                  onClick={() => removeFromLibrary(story.story_id, activeTab)}
                  title={`Remove from ${activeTab}`}
                >
                  <X size={16} />
                </button>
                <StoryCard key={story.story_id} story={story} onUpdateStory={updateLibraryStory} />
              </div>
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
// Full Story Page Component
function FullStoryPage() {
    const { id } = useParams();
    const [story, setStory] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showToast, setShowToast] = useState(false);
    const [isLiked, setIsLiked] = useState(false);
    const [isSaved, setIsSaved] = useState(false);
    const [likeCount, setLikeCount] = useState(0);
    const { user } = useAuth();
    const navigate = useNavigate();

    // Helper function to render bold markdown
    const renderWithBold = (text) => {
        if (!text) return null
        const parts = text.split(/(\*\*[^*]+\*\*)/g)
        return parts.map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={i}>{part.slice(2, -2)}</strong>
            }
            return part
        })
    }

    // Handle like functionality
    const handleLike = async () => {
      if (!user) return;
      
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/stories/${story.story_id}/like`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          
          // Update localStorage tracking
          const likedStories = JSON.parse(localStorage.getItem('likedStories') || '[]');
          if (isLiked) {
            // Remove from liked stories
            const newLikedStories = likedStories.filter(id => id !== story.story_id);
            localStorage.setItem('likedStories', JSON.stringify(newLikedStories));
          } else {
            // Add to liked stories
            likedStories.push(story.story_id);
            localStorage.setItem('likedStories', JSON.stringify(likedStories));
          }
          
          setIsLiked(!isLiked);
          setLikeCount(data.likes_count);
          
          // Update story object with new counts
          setStory(prev => ({
            ...prev,
            likes_count: data.likes_count,
            saves_count: data.saves_count
          }));
        }
      } catch (error) {
        console.error('Error liking story:', error);
      }
    };

    // Handle bookmark functionality
    const handleBookmark = async () => {
      if (!user) return;
      
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/stories/${story.story_id}/save`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          
          // Update localStorage tracking
          const savedStories = JSON.parse(localStorage.getItem('savedStories') || '[]');
          if (isSaved) {
            // Remove from saved stories
            const newSavedStories = savedStories.filter(id => id !== story.story_id);
            localStorage.setItem('savedStories', JSON.stringify(newSavedStories));
          } else {
            // Add to saved stories
            savedStories.push(story.story_id);
            localStorage.setItem('savedStories', JSON.stringify(savedStories));
          }
          
          setIsSaved(!isSaved);
          
          // Update story object with new counts
          setStory(prev => ({
            ...prev,
            likes_count: data.likes_count,
            saves_count: data.saves_count
          }));
        }
      } catch (error) {
        console.error('Error saving story:', error);
      }
    };

    // Handle share functionality
    const handleShare = async () => {
      const shareData = {
        title: story.title,
        url: window.location.href
      };

      try {
        if (navigator.share) {
          // Use Web Share API for mobile devices
          await navigator.share(shareData);
        } else {
          // Fallback: copy URL to clipboard
          await navigator.clipboard.writeText(shareData.url);
          setShowToast(true);
          setTimeout(() => setShowToast(false), 2000);
        }
      } catch (error) {
        console.error('Error sharing:', error);
      }
    };

    useEffect(() => {
      const fetchStory = async () => {
        try {
          const response = await fetch(`${API_BASE_URL}/api/stories/${id}`);
          if (response.ok) {
            const storyData = await response.json();
            setStory(storyData);
            
            // Track article read in localStorage
            const readStories = JSON.parse(localStorage.getItem('readStories') || '[]');
            if (!readStories.includes(storyData.story_id)) {
              readStories.push(storyData.story_id);
              localStorage.setItem('readStories', JSON.stringify(readStories));
            }
            
            // Load like and bookmark state
            if (user) {
              const likedStories = JSON.parse(localStorage.getItem('likedStories') || '[]');
              const savedStories = JSON.parse(localStorage.getItem('savedStories') || '[]');
              setIsLiked(likedStories.includes(storyData.story_id));
              setIsSaved(savedStories.includes(storyData.story_id));
              
              // Use global like count from story data
              setLikeCount(storyData.likes_count || 0);
            }
          }
        } catch (error) {
          console.error('Error fetching story:', error);
        } finally {
          setLoading(false);
        }
      };
      fetchStory();
    }, [id, user]);

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

      // Function to convert **bold** markdown to <strong> tags
      const renderBold = (text) => {
        return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      };

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
          headline = renderBold(cleanLine(trimmedLine));
          return;
        }
        
        if (trimmedLine.toLowerCase() === 'fast facts') {
          inFastFacts = true;
          return;
        }
        
        if (inFastFacts && trimmedLine) {
          // Strip leading dashes/bullets from fast facts
          const clean = renderBold(cleanLine(trimmedLine.replace(/^[-\u2022]\s*/, '')));
          if (clean) fastFacts.push(clean);
        } else if (!inFastFacts && trimmedLine) {
          // Add to body after cleaning
          const clean = renderBold(cleanLine(trimmedLine));
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

        {/* Toast notification for clipboard copy */}
        {showToast && (
          <div className="share-toast">
            Link copied!
          </div>
        )}

        {/* Back button and Share button - Moved above image */}
        <div className="full-story-actions-fixed">
          <button 
            className="back-to-briefing-btn"
            onClick={() => window.history.back()}
          >
            ← Back to Briefing
          </button>
          <button 
            className="share-btn"
            onClick={handleShare}
            title="Share article"
          >
            Share ↗
          </button>
        </div>

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

            {/* Like and Bookmark buttons */}
            <div className="full-story-actions-row">
              <button 
                className={`like-btn ${isLiked ? 'liked' : ''}`}
                onClick={handleLike}
                title="Like article"
              >
                {isLiked ? '❤️' : '🤍'}
                <span className="like-count">{story.likes_count || 0}</span>
              </button>
              <button 
                className={`bookmark-btn ${isSaved ? 'saved' : ''}`}
                onClick={handleBookmark}
                title="Bookmark article"
              >
                {isSaved ? '🔖' : '🔖'}
                <span className="bookmark-count">{story.saves_count || 0}</span>
              </button>
            </div>

            <hr className="full-story-divider" />

            {/* Headline sentence */}
            {headline && (
              <p 
                className="full-story-headline" 
                dangerouslySetInnerHTML={{ __html: headline }}
              />
            )}

            {/* Body paragraphs */}
            <div className="full-story-body">
              {body.map((para, i) => (
                <p 
                  key={i} 
                  className="full-story-para"
                  dangerouslySetInnerHTML={{ __html: para }}
                />
              ))}
            </div>

            {/* Fast Facts */}
            {fastFacts.length > 0 && (
              <div className="full-story-facts">
                <h3 className="full-story-facts-title">Fast Facts</h3>
                <ul className="full-story-facts-list">
                  {fastFacts.map((fact, i) => (
                    <li key={i}>
                      {renderWithBold(fact)}
                    </li>
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
