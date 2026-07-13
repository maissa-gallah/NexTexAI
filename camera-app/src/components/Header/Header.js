import React from 'react';
import { FaVideo } from 'react-icons/fa';
import './Header.css';

export default function Header({ isConnected, error }) {
  const statusText = isConnected ? 'Live' : error ? 'Error' : 'Offline';

  return (
    <header className="header">
      <h1><FaVideo style={{ marginRight: 8 }} /> Live Camera Feed</h1>
      <div className="header-controls">
        <div className="status-indicator">
          <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`} />
          <span className="status-text">{statusText}</span>
        </div>
      </div>
    </header>
  );
}
