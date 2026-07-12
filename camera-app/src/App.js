import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import DashboardAlerts from './DashboardAlerts';

// ─── Multipart stream parser helpers ───────────────────────────────────────

const BOUNDARY_START = new TextEncoder().encode('--frame\r\n');
const BOUNDARY = new TextEncoder().encode('\r\n--frame\r\n');
const HEADER_END = new TextEncoder().encode('\r\n\r\n');

/** Find a byte sequence inside a Uint8Array. Returns index or -1. */
function findSequence(haystack, needle) {
  if (needle.length === 0) return 0;
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    let match = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) { match = false; break; }
    }
    if (match) return i;
  }
  return -1;
}

/** Concatenate two Uint8Arrays. */
function concat(a, b) {
  const result = new Uint8Array(a.length + b.length);
  result.set(a);
  result.set(b, a.length);
  return result;
}

/**
 * Consume a ReadableStream of multipart/x-mixed-replace data.
 * Calls onJson(parsed) for each JSON metadata frame and
 * onImage(jpegBytes) for each JPEG frame.
 */
async function consumeStream(reader, onJson, onImage, signal) {
  let buffer = new Uint8Array(0);
  let state = 'finding_boundary';
  let contentType = '';

  while (!signal.aborted) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer = concat(buffer, value);

    while (!signal.aborted) {
      if (state === 'finding_boundary') {
        const idx = findSequence(buffer, BOUNDARY_START);
        if (idx === -1) break;
        buffer = buffer.slice(idx + BOUNDARY_START.length);
        state = 'reading_headers';
      } else if (state === 'reading_headers') {
        const endIdx = findSequence(buffer, HEADER_END);
        if (endIdx === -1) break;
        const headerBytes = buffer.slice(0, endIdx);
        const headers = new TextDecoder().decode(headerBytes);
        const ctMatch = headers.match(/Content-Type:\s*(\S+)/i);
        contentType = ctMatch ? ctMatch[1].toLowerCase() : '';
        buffer = buffer.slice(endIdx + HEADER_END.length);
        state = 'reading_body';
      } else if (state === 'reading_body') {
        const boundaryPos = findSequence(buffer, BOUNDARY);
        if (boundaryPos === -1) break;

        const body = buffer.slice(0, boundaryPos);

        if (contentType === 'application/json') {
          try {
            onJson(JSON.parse(new TextDecoder().decode(body)));
          } catch (_) { /* skip malformed JSON */ }
        } else if (contentType === 'image/jpeg') {
          onImage(body);
        }

        buffer = buffer.slice(boundaryPos + BOUNDARY.length);
        state = 'reading_headers';
      }
    }
  }
}

// ─── App component ─────────────────────────────────────────────────────────

const DEFECT_CLASS_COLORS = {
  'Broken stitch': '#e74c3c',
  'defect free': '#2ecc71',
  'hole': '#e67e22',
  'horizontal': '#3498db',
  'lines': '#9b59b6',
  'Needle mark': '#f1c40f',
  'Pinched fabric': '#1abc9c',
  'stain': '#e91e63',
  'Vertical': '#00bcd4',
};

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
  const [prediction, setPrediction] = useState(null);
  const [currentImageUrl, setCurrentImageUrl] = useState(null);

  const imgRef = useRef(null);
  const frameCountRef = useRef(0);
  const lastFpsUpdateRef = useRef(Date.now());
  const streamStateRef = useRef({ abortController: null, active: false });
  const statusIntervalRef = useRef(null);
  const lastImageUrlRef = useRef(null);

  // ── Update FPS counter ────────────────────────────────────────────────
  const tallyFrame = useCallback(() => {
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

  // ── Start / stop the stream reader ────────────────────────────────────
  const startStream = useCallback(async (url) => {
    const state = streamStateRef.current;
    // Abort any previous stream
    if (state.abortController) {
      state.abortController.abort();
    }
    state.active = true;

    const abortController = new AbortController();
    state.abortController = abortController;

    // Reset counters
    frameCountRef.current = 0;
    lastFpsUpdateRef.current = Date.now();

    try {
      setIsConnected(true);
      setError(null);

      const response = await fetch(url, { signal: abortController.signal });
      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();

      await consumeStream(
        reader,
        // onJson – metadata frame
        (data) => {
          setPrediction(data);
          if (data.counter !== undefined) {
            setImageCount(data.counter);
          }
        },
        // onImage – JPEG frame
        (jpegBytes) => {
          const blob = new Blob([jpegBytes], { type: 'image/jpeg' });
          const objectUrl = URL.createObjectURL(blob);

          // Revoke previous blob URL to avoid memory leaks
          if (lastImageUrlRef.current) {
            URL.revokeObjectURL(lastImageUrlRef.current);
          }
          lastImageUrlRef.current = objectUrl;

          setCurrentImageUrl(objectUrl);
          tallyFrame();
        },
        abortController.signal
      );
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(`Stream error: ${err.message}`);
      setIsConnected(false);

      // Auto-reconnect after 3 s
      if (state.active) {
        setTimeout(() => {
          if (state.active) startStream(streamUrl);
        }, 3000);
      }
    } finally {
      if (state.abortController === abortController) {
        setIsConnected(false);
      }
    }
  }, [streamUrl, tallyFrame]);

  const stopStream = useCallback(() => {
    const state = streamStateRef.current;
    state.active = false;
    if (state.abortController) {
      state.abortController.abort();
      state.abortController = null;
    }
    if (lastImageUrlRef.current) {
      URL.revokeObjectURL(lastImageUrlRef.current);
      lastImageUrlRef.current = null;
    }
    setCurrentImageUrl(null);
    setIsConnected(false);
  }, []);

  // ── Fetch /status for debug info ──────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:8000/status');
      if (response.ok) {
        setStatus(await response.json());
      }
    } catch (_) { /* ignore */ }
  }, []);

  // ── Toggle / pause / resume ───────────────────────────────────────────
  const toggleStream = useCallback(() => {
    if (isStreaming) {
      stopStream();
      setIsStreaming(false);
    } else {
      setIsStreaming(true);
    }
  }, [isStreaming, stopStream]);

  const refreshStream = useCallback(() => {
    stopStream();
    // Re-start on next render via the effect
    setTimeout(() => setIsStreaming(true), 50);
  }, [stopStream]);

  const updateStreamUrl = useCallback((newUrl) => {
    setStreamUrl(newUrl);
    setUrlInput(newUrl);
    setShowUrlInput(false);
    setError(null);
    stopStream();
    setIsStreaming(true);
  }, [stopStream]);

  const resetToDefault = useCallback(() => {
    updateStreamUrl('http://localhost:8000/video_feed');
  }, [updateStreamUrl]);

  // ── Effect: start stream when isStreaming or streamUrl changes ────────
  useEffect(() => {
    if (isStreaming) {
      startStream(streamUrl);
    } else {
      stopStream();
    }
  }, [isStreaming, streamUrl, startStream, stopStream]);

  // ── Status polling ────────────────────────────────────────────────────
  useEffect(() => {
    statusIntervalRef.current = setInterval(fetchStatus, 2000);
    return () => {
      if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    };
  }, [fetchStatus]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStream();
      if (lastImageUrlRef.current) {
        URL.revokeObjectURL(lastImageUrlRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Render ────────────────────────────────────────────────────────────
  const predColor = prediction
    ? DEFECT_CLASS_COLORS[prediction.class] || '#667eea'
    : '#667eea';

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
        <h1> hello </h1>
        <DashboardAlerts />

        {showUrlInput && (
          <div className="settings-panel">
            <div className="settings-row">
              <input
                type="text"
                className="url-input"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Enter stream URL..."
                onKeyDown={(e) => e.key === 'Enter' && updateStreamUrl(urlInput)}
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

          {currentImageUrl && isStreaming && (
            <img
              ref={imgRef}
              className="feed-image"
              src={currentImageUrl}
              alt="Camera Feed"
            />
          )}

          {!currentImageUrl && isStreaming && (
            <div className="loading-overlay">
              <div className="spinner" />
              <p>Connecting to stream...</p>
            </div>
          )}

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

          {/* ── Prediction overlay from stream metadata ── */}
          {prediction && isStreaming && (
            <div className="prediction-overlay" style={{ borderColor: predColor }}>
              <div className="prediction-header" style={{ backgroundColor: predColor }}>
                <span className="prediction-class">{prediction.class}</span>
                <span className="prediction-confidence">
                  {(prediction.confidence * 100).toFixed(1)}%
                </span>
              </div>
              <div className="prediction-bar-track">
                <div
                  className="prediction-bar-fill"
                  style={{
                    width: `${(prediction.confidence * 100).toFixed(1)}%`,
                    backgroundColor: predColor,
                  }}
                />
              </div>
              <div className="prediction-counter">
                Frame #{prediction.counter || imageCount}
              </div>
            </div>
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
              {prediction && (
                <div className="debug-item full-width">
                  <span className="debug-label">Latest Prediction:</span>
                  <span className="debug-value">
                    {prediction.class} ({(prediction.confidence * 100).toFixed(1)}%)
                  </span>
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