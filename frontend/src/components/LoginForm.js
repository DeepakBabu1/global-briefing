import React, { useState, useContext } from 'react';
import { Mail, Lock, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../App';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useContext(AuthContext);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const success = await login(email, password);
      if (success) {
        // Force a hard redirect to the home page to refresh auth state
        window.location.assign('/');
      }
    } catch (err) {
      setError('Invalid email or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="auth-title">Welcome Back</h1>
      <p className="auth-subtitle">Sign in to access your personalized briefing</p>

      <form onSubmit={handleSubmit}>
        <div className="auth-input-wrapper">
          <Mail className="auth-icon" size={20} strokeWidth={1.5} />
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="auth-input"
            required
          />
        </div>

        <div className="auth-input-wrapper">
          <Lock className="auth-icon" size={20} strokeWidth={1.5} />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="auth-input"
            required
          />
        </div>

        {error && (
          <div style={{ 
            borderRadius: '8px', 
            background: '#fef2f2', 
            padding: '12px 16px', 
            fontSize: '14px', 
            color: '#dc2626',
            border: '1px solid #fecaca',
            marginBottom: '20px'
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="auth-button"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      <div className="auth-divider">
        <span>OR</span>
      </div>

      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: '14px', color: '#6b7280' }}>
          Don't have an account?{' '}
          <a href="/signup" className="auth-link">
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
}