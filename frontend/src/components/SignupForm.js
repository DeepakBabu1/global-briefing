import React, { useState } from 'react';
import { User, Mail, Lock, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const validTLDs = ['.com', '.org', '.net', '.edu', '.gov', '.mil', '.io', '.co', '.us', '.uk', '.ca', '.au', '.de', '.fr', '.jp', '.cn', '.in', '.br', '.mx', '.es', '.it', '.nl', '.se', '.no', '.dk', '.fi', '.ch', '.at', '.be', '.ie', '.nz', '.sg', '.my', '.ph', '.th', '.vn', '.id', '.kr'];
  if (!emailRegex.test(email)) return false;
  return validTLDs.some(tld => email.toLowerCase().endsWith(tld));
};

export function SignupForm() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!isValidEmail(email)) {
      setError('Please enter a valid email address');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem('token', data.access_token);
        // Navigate directly — no body animation hack needed
        navigate('/onboarding', { replace: true });
      } else {
        throw new Error(data.detail || 'Signup failed');
      }
    } catch (err) {
      setError(err.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="auth-title">Create Your Account</h1>
      <p className="auth-subtitle">Join the elite circle of informed readers</p>

      <form onSubmit={handleSubmit}>
        <div className="auth-input-wrapper">
          <User className="auth-icon" size={20} strokeWidth={1.5} />
          <input
            type="text"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="auth-input"
            required
          />
        </div>

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
          {loading ? 'Creating account...' : 'Create Account'}
        </button>
      </form>

      <div className="auth-divider">
        <span>OR</span>
      </div>

      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: '14px', color: '#6b7280' }}>
          Already have an account?{' '}
          <a href="/login" className="auth-link">
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}