import React from 'react';
import { FaPause, FaPlay, FaSyncAlt, FaChartBar, FaBolt, FaExclamationTriangle, FaCopyright } from 'react-icons/fa';
import { useVideoStream } from '../../hooks/useVideoStream';
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
              {isStreaming ? <><FaPause /> Pause</> : <><FaPlay /> Resume</>}
            </button>
            <button className="btn btn-primary" onClick={refreshStream}>
              <FaSyncAlt /> Refresh
            </button>
          </div>
          <div className="stats">
            <span><FaChartBar style={{ marginRight: 4 }} /> Frames: {imageCount}</span>
            <span><FaBolt style={{ marginRight: 4 }} /> FPS: {fps}</span>
          </div>
        </div>
        <DashboardAlerts />

        <div className="content-layout">
          <div className="content-main">
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
                <FaExclamationTriangle style={{ marginRight: 6 }} /> {error}
              </div>
            )}
          </div>
          <aside className="content-side">
            <CloudStatus />
          </aside>
        </div>
      </main>

      <footer className="footer">
        <span>Powered by NexTex AI</span>
        <span>Stream: {streamUrl}</span>
        <span><FaCopyright style={{ marginRight: 4 }} /> {new Date().getFullYear()}</span>
      </footer>
    </div>
  );
};

export default App;
