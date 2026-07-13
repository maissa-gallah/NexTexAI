import React from 'react';
import { useVideoStream } from '../../hooks/useVideoStream';
import { useSystemStatus } from '../../hooks/useSystemStatus';
import Header from '../Header/Header';
import CameraFeed from '../CameraFeed/CameraFeed';
import DashboardAlerts from '../DashboardAlerts/DashboardAlerts';
import CloudStatus from '../CloudStatus/CloudStatus';
import './App.css';

const App = () => {
  const {
    isConnected,
    isStreaming,
    imageCount,
    fps,
    error,
    streamUrl,
    prediction,
    currentImageUrl,
    toggleStream,
    refreshStream,
  } = useVideoStream();

  const status = useSystemStatus();

  return (
    <div className="app">
      <Header isConnected={isConnected} error={error} />

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
          </div>
          <div className="stats">
            <span>📊 Frames: {imageCount}</span>
            <span>⚡ FPS: {fps}</span>
            {status && (
              <span>📦 Queue: {status.queue_size || 0}</span>
            )}
          </div>
        </div>

        <DashboardAlerts />
        <CloudStatus />

        <CameraFeed
          isConnected={isConnected}
          isStreaming={isStreaming}
          currentImageUrl={currentImageUrl}
          imageCount={imageCount}
          fps={fps}
          prediction={prediction}
        />

        {error && (
          <div className="error-message">
            ⚠️ {error}
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
