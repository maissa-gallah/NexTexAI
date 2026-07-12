import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

const App = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(true);
  const [imageCount, setImageCount] = useState(0);
  const [fps, setFps] = useState(0);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [showDebug, setShowDebug] = useState(false);
  const [streamUrl, setStreamUrl] = useState('http://localhost:8000/video_feed');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInput, setUrlInput] = useState('http://localhost:8000/video_feed');

  const imgRef = useRef(null);
  const frameCountRef = useRef(0);
  const lastFpsUpdateRef = useRef(Date.now());
  const reconnectTimerRef = useRef(null);
  const statusIntervalRef = useRef(null);

  const handleFrameLoad = useCallback(() => {
    frameCountRef.current += 1;
    setImageCount(prev => prev + 1);
    setError(null);

    const now = Date.now();
    if (now - lastFpsUpdateRef.current >= 1000) {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
      lastFpsUpdateRef.current = now;
    }
  }, []);

  const handleFrameError = useCallback(() => {
    setError('Failed to load video stream. Retrying...');
    setIsConnected(false);

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }
    reconnectTimerRef.current = setTimeout(() => {
      if (imgRef.current) {
        const timestamp = new Date().getTime();
        imgRef.current.src = `${streamUrl}?t=${timestamp}`;
      }
    }, 3000);
  }, [streamUrl]);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:8000/status');
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
        setIsConnected(data.status === 'connected');
      }
    } catch (err) {
    }
  }, []);

  const toggleStream = useCallback(() => {
    if (isStreaming) {
      if (imgRef.current) {
        imgRef.current.src = '';
      }
      setIsStreaming(false);
    } else {
      if (imgRef.current) {
        const timestamp = new Date().getTime();
        imgRef.current.src = `${streamUrl}?t=${timestamp}`;
      }
      setIsStreaming(true);
      setIsConnected(true);
    }
  }, [isStreaming, streamUrl]);

  const updateStreamUrl = useCallback((newUrl) => {
    setStreamUrl(newUrl);
    setUrlInput(newUrl);
    if (imgRef.current) {
      const timestamp = new Date().getTime();
      imgRef.current.src = `${newUrl}?t=${timestamp}`;
    }
    setShowUrlInput(false);
    setError(null);
  }, []);

  const refreshStream = useCallback(() => {
    if (imgRef.current && isStreaming) {
      const timestamp = new Date().getTime();
      imgRef.current.src = `${streamUrl}?t=${timestamp}`;
    }
  }, [streamUrl, isStreaming]);

  const resetToDefault = useCallback(() => {
    updateStreamUrl('http://localhost:8000/video_feed');
  }, [updateStreamUrl]);

  useEffect(() => {
    if (imgRef.current && isStreaming) {
      const timestamp = new Date().getTime();
      imgRef.current.src = `${streamUrl}?t=${timestamp}`;
    }

    statusIntervalRef.current = setInterval(fetchStatus, 2000);

    return () => {
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, [streamUrl, isStreaming, fetchStatus]);

  return (
    <div className="app">
      <header className="header">
        <h1>📹 Live Camera Feed</h1>
        <div className="header-controls">
          <div className="status-indicator">
            <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`} />
            <span className="status-text">
              {isConnected ? 'Live' : error ? 'Error' : 'Offline'}
            </span>
          </div>
          <button 
            className={`btn ${showDebug ? 'btn-active' : 'btn-secondary'}`}
            onClick={() => setShowDebug(!showDebug)}
          >
            🛠️ Debug
          </button>
        </div>
      </header>

      <main className="main-content">
        <div className="controls-bar">
          <div className="controls-group">
            <button 
              className={`btn ${isStreaming ? 'btn-danger' : 'btn-success'}`}
              onClick={toggleStream}
            >
              {isStreaming ? '⏸️ Pause' : '▶️ Resume'}
            </button>
            <button className="btn btn-primary" onClick={refreshStream}>
              🔄 Refresh
            </button>
            <button 
              className="btn btn-secondary"
              onClick={() => setShowUrlInput(!showUrlInput)}
            >
              ⚙️ Settings
            </button>
          </div>
          <div className="stats">
            <span>📊 Frames: {imageCount}</span>
            <span>⚡ FPS: {fps}</span>
            {status && (
              <span>📦 Queue: {status.queue_size || 0}</span>
            )}
          </div>
        </div>

        {showUrlInput && (
          <div className="settings-panel">
            <div className="settings-row">
              <input
                type="text"
                className="url-input"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Enter stream URL..."
                onKeyPress={(e) => e.key === 'Enter' && updateStreamUrl(urlInput)}
              />
              <button className="btn btn-primary" onClick={() => updateStreamUrl(urlInput)}>
                Apply
              </button>
              <button className="btn btn-secondary" onClick={resetToDefault}>
                Reset
              </button>
              <button className="btn btn-secondary" onClick={() => setShowUrlInput(false)}>
                Close
              </button>
            </div>
            <div className="presets">
              <span>Presets:</span>
              <button 
                className="btn btn-sm btn-secondary"
                onClick={() => updateStreamUrl('http://localhost:8000/video_feed')}
              >
                Local MJPEG
              </button>
              <button 
                className="btn btn-sm btn-secondary"
                onClick={() => updateStreamUrl('http://localhost:8001/video_feed')}
              >
                Backup Stream
              </button>
            </div>
          </div>
        )}

        <div className="feed-container">
          {!isStreaming && (
            <div className="paused-overlay">
              <div className="pause-icon">⏸️</div>
              <h2>Stream Paused</h2>
              <p>Click "Resume" to continue the feed</p>
            </div>
          )}
          
          <img
            ref={imgRef}
            className="feed-image"
            alt="Camera Feed"
            onLoad={handleFrameLoad}
            onError={handleFrameError}
            style={{ display: isStreaming ? 'block' : 'none' }}
          />

          {isConnected && isStreaming && (
            <>
              <div className="frame-info">
                Frame #{imageCount} | FPS: {fps}
              </div>
              <div className={`quality-badge ${fps > 15 ? 'good' : fps > 5 ? 'medium' : 'poor'}`}>
                {fps > 15 ? '🟢 Excellent' : fps > 5 ? '🟡 Good' : '🔴 Poor'}
              </div>
            </>
          )}
        </div>

        {error && (
          <div className="error-message">
            ⚠️ {error}
          </div>
        )}

        {showDebug && status && (
          <div className="debug-panel">
            <h3>Debug Information</h3>
            <div className="debug-grid">
              <div className="debug-item">
                <span className="debug-label">Status:</span>
                <span className="debug-value">{status.status}</span>
              </div>
              <div className="debug-item">
                <span className="debug-label">Images Received:</span>
                <span className="debug-value">{status.images_received}</span>
              </div>
              <div className="debug-item">
                <span className="debug-label">Queue Size:</span>
                <span className="debug-value">{status.queue_size}</span>
              </div>
              <div className="debug-item">
                <span className="debug-label">Last Update:</span>
                <span className="debug-value">{status.last_update || 'Never'}</span>
              </div>
              <div className="debug-item">
                <span className="debug-label">Broker:</span>
                <span className="debug-value">{status.broker}</span>
              </div>
              <div className="debug-item">
                <span className="debug-label">Topic:</span>
                <span className="debug-value">{status.topic}</span>
              </div>
              {status.error && (
                <div className="debug-item full-width">
                  <span className="debug-label">Error:</span>
                  <span className="debug-value error">{status.error}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="footer">
        <span>Powered by MQTT & FastAPI</span>
        <span>Stream: {streamUrl}</span>
        <span>© {new Date().getFullYear()}</span>
      </footer>
    </div>
  );
};

export default App;