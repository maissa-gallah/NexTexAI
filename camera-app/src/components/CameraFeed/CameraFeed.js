import React from 'react';
import PredictionOverlay from '../PredictionOverlay/PredictionOverlay';
import './CameraFeed.css';

export default function CameraFeed({
  isConnected,
  isStreaming,
  currentImageUrl,
  imageCount,
  fps,
  prediction,
}) {
  return (
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

      {prediction && isStreaming && (
        <PredictionOverlay prediction={prediction} imageCount={imageCount} />
      )}
    </div>
  );
}
