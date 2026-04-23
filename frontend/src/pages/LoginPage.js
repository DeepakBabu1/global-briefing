import React from 'react';
import { LoginForm } from '../components/LoginForm';

export default function LoginPage() {
  return (
    <div className="auth-split-container">
      {/* Left Panel - Gradient with Quote */}
      <div className="auth-left-panel">
        <div className="auth-left-content">
          <div className="auth-left-quote">
            "Stay informed. Stay ahead."
          </div>
          <div className="auth-left-subtitle">
            Your trusted source for curated news and insights from around the world
          </div>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="auth-right-panel">
        <div className="auth-form-container">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
